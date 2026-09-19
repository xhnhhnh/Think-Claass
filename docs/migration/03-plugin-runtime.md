# P3 — Plugin Runtime and Reference Plugins

**Status:** complete
**Depends on:** [P2 contracts and auth](02-contracts-and-auth.md)
**Gate result:** `npm test` 112 files / 399 tests green · `tsc --noEmit` exit 0 · 288 endpoints unchanged · both compositions verified on a running server

---

## 1. What P3 delivers

The plugin architecture is now real and running, not described:

```
Core → Plugin Runtime → Plugin API / SDK → Plugins
```

A kernel-mode boot discovers `plugins/`, validates manifests, resolves dependencies,
applies plugin migrations through the versioned ledger, builds a Nest module graph
from plugin controllers, publishes service ports and enforces table ownership and
event declarations.

```
$ KERNEL_ENABLED=1 PLUGINS_ENABLED=1 npx tsx api/server.ts
[kernel] plugin discovery complete {"discovered":2,"rejected":0,"scannedDirs":2}
[kernel:plugin:classroom] classroom port published {"service":"classroom.public"}
[kernel:plugin:pet] pet service ready {"owns":"pet"}
[kernel] plugin controllers mounted {"modules":1}
[kernel] plugin activated {"pluginId":"classroom"}   ← foundation, ordered first
[kernel] plugin activated {"pluginId":"pet"}
[kernel] kernel ready {"bootMs":74}

GET /api/health   {"plugins":{"total":2,"active":2,"degraded":0}}
GET /api/pet/health  {"success":true,"data":{"plugin":"pet","version":"1.0.0"}}
```

---

## 2. Packages and plugins added

| Path | Purpose |
|---|---|
| `packages/plugin-sdk` | `definePlugin`, manifest validator, semver ranges, `KernelContext`, `PLUGIN_CONTEXT` token |
| `packages/plugin-runtime` | discovery, resolver, lifecycle host, boundary, service registry, ownership-checked db API, migration runner, state store |
| `plugins/classroom` | **foundation tier, `required: true`** — owns classes/students, publishes `classroom.public` |
| `plugins/pet` | **feature tier** — reference plugin exercising every extension point |

### Why `classroom` is a plugin rather than core

Almost every domain references students and classes, which is exactly why the
temptation is to put them in the kernel. Doing so would make the kernel
domain-aware and contradict "minimal core". Instead `classroom` is a foundation
plugin: it runs through the same manifest, lifecycle and migration machinery as any
feature plugin, but declares `required: true`, and **the kernel refuses to boot if a
required plugin cannot activate**.

The kernel never imports it. `ctx.use('classroom.public')` resolves the port.

### The `pet` plugin as the reference implementation

Between its manifest and `src/index.ts` it exercises every extension point:

| Extension point | Demonstration |
|---|---|
| own schema | `migrations/0001_init.sql` → `p_pet_pets`, `p_pet_praise_log` |
| HTTP surface | `PetController` (Nest), assembled at boot |
| service port | publishes `pet.public` |
| events | emits `pet.adopted`, `pet.action.performed`; subscribes `classroom.student.points.changed` |
| permissions | `pet.adopt`, `pet.interact` declared in the manifest |
| cross-plugin collaboration | consumes `classroom.public`; declares **no** read access to `students` |

That last row is the architecture in one line: pet manipulates student points
without ever naming the `students` table.

---

## 3. Design decisions

**Declared-then-permitted.** The manifest is the contract, and the runtime enforces
it rather than trusting it: emitting an undeclared event, subscribing to an
undeclared topic, mounting an undeclared route, or writing to a table you do not own
all fail at the call site. Fail-closed, because a plugin that quietly exceeds its
declaration is the failure mode that matters.

**`data.adopted` — an honest escape hatch.** `classroom` must write to `students`,
but that table still carries its legacy name and the manifest validator (rightly)
requires owned tables to be prefixed `p_<slug>_`. Rather than weaken the rule or
misdeclare ownership, a plugin may declare `data.adopted`: *owned, still
legacy-named*. Guardrail **G10** ratchets the total (currently 2) to zero, so the
transitional state is counted and finite instead of becoming permanent.

**Ownership checks are development-time.** `ctx.db` validates every statement
against declared tables while `env !== 'production'`, where parsing SQL on every
query is not worth the cost. `ctx.rawDb` exists for maintenance and bypasses the
checks — reaching for it in feature code is a smell, and it is named to make that
obvious.

**Plugin set is an input to boot.** A direct consequence of spike R10: re-resolve
and restart rather than mutate a running router. Simpler, deterministic, and it
matches the existing PM2 deploy model.

**Plugin errors use the kernel envelope.** Nest's default filter duck-types any
error carrying `status`, so a plugin throwing `ApiError` already got the right HTTP
status — but Nest's own `{ statusCode, message }` body, which dropped the `code`
field and diverged from every non-plugin endpoint. The runtime registers a global
filter delegating to `renderError`, so one error shape covers the system.

---

## 4. Defects found and fixed while building this

Every one of these was caught by an end-to-end test or a real boot, not by
inspection:

1. **`boundary.run` could not distinguish "returned nothing" from "threw".** It
   returned `T | undefined`, so every `setup()` hook — which returns `void` — looked
   like a failure and no plugin ever activated. Replaced with an explicit
   `RunOutcome<T>`, whose branches declare each other's fields as optional so
   reading `.error` never depends on narrowing an instantiated generic.

2. **The plugin state table was never created.** The host wrote to `__plugins`
   before running its own migration. It now migrates through the same versioned
   runner as plugin schemas.

3. **`^1` was unparsable.** The semver parser required three components, so the
   idiomatic `kernel: "^1"` failed validation and silently rejected every plugin.
   Ranges now accept partial versions (`^1` → `^1.0.0`); the `version` field itself
   stays strict.

4. **Plugins mounted after the kernel's 404 handler**, making every plugin route
   unreachable. The kernel now exposes a `mountPlugins` hook that runs at the correct
   point in the middleware stack, and `api/app.ts` uses it instead of mounting
   afterwards.

5. **Nest's catch-all not-found handler shadowed the SPA fallback.** Nest's `init()`
   installs a `use` handler that answers every path when no global prefix is set, so
   the static/SPA middleware now registers *before* the plugin host; API requests
   still fall through because the SPA handler passes `/api` through.

6. **The plugin directory was scanned twice** — once from the config default and
   once from the explicitly appended path — so every plugin was rejected as a
   duplicate id. The scan list is now resolved and deduplicated.

7. **A missing `dependsOn` in pet's manifest.** The test asserting the declared
   dependency failed; pet worked only because foundation tier happens to sort first.
   Ordering by luck is not ordering.

8. **Conflict reporting named only one side.** A plugin blocked because *another*
   plugin declared a conflict was rejected silently with no reason. Both
   participants now carry a reason.

9. **`GET /api/pet/students/<unknown>` returned "no pet" instead of 404**, making a
   typo in a student id indistinguishable from a student who has not adopted yet.

10. **Guardrail false positives** from new kernel SQL: `ON CONFLICT ... DO UPDATE SET`
    was parsed as a table reference named `SET`. Plugin manifests' `entry.backend` is
    now also treated as a reachability root, so the five plugin source files are not
    counted as dead code.

---

## 5. Verification

### Suites

| Project | Files | Tests |
|---|---|---|
| `app` | 95 | 235 |
| `backend` (kernel + runtime + plugins) | 9 | 137 |
| `guardrails` | 8 | 27 |
| **total** | **112** | **399** |

The backend project grew from 59 to 137 tests: 19 end-to-end plugin tests, plus
manifest validation, dependency resolution, boundary isolation, database ownership
and the service registry.

### Ratchets (all unchanged or improved)

`shimPages 62` · `deadCode 70` · `staticPluginRoutes 76` · `legacyFeatureKeySurfaces 2` · **new** `adoptedTables 2`

### Both compositions, on a running server

| | kernel mode | legacy mode |
|---|---|---|
| `/api/health` | kernel shape, plugins 2/2 | legacy shape |
| `/api/pet/health` | **200** (plugin route) | 404 (plugins not mounted) |
| `/api/kernel/auth/login` | 200 + token | 200 + token |
| `/api/auth/login` | 404 (legacy app absent) | 200 + token |
| `/api/settings` | 404 | 200 |
| legacy header auth | n/a | honoured (bridge on) |

---

## 6. P3 acceptance

| Criterion | Result |
|---|---|
| Plugin runtime: discovery, validation, resolution, lifecycle, registries, isolation, migrations, state | ✅ |
| Kernel boots with zero plugins | ✅ (unchanged from P1) |
| Kernel boots with plugins | ✅ 74 ms, 2 active |
| Disabling a plugin removes its routes | ✅ covered by resolver + boundary tests |
| A required plugin that cannot activate fails the boot | ✅ `createPluginHost` throws |
| Cross-plugin calls go only through ports | ✅ `pet` uses `classroom.public`, declares no `students` read |
| Third-party plugin needs no core changes | ✅ manifest + SDK only; G1/G7 enforce it |
| Existing suites and endpoint surface | ✅ 399 tests, 288 endpoints unchanged |

---

## 7. Carried forward

- **`classroom` HTTP surface** still lives in `api/modules/classroom`; P4 moves it.
  P3 established the *access path*, not the endpoint ownership.
- **`widget`/frontend registration** is declared in manifests but not consumed — the
  frontend pluginization is P5.
- **Scheduled jobs** are rejected at boot with a clear message rather than silently
  ignored; the scheduler arrives in P6.
- **`in-process-restricted` is not a security sandbox.** It prevents mistakes, not
  malice. Real confinement needs the `worker` isolation level (P6).
- **Unmatched `/api` paths in kernel mode** are answered by Nest's not-found handler
  rather than the kernel's envelope. P4 replaces Nest-owned routing for plugins.

**Next:** P4 — move the remaining backend domains into plugins, starting by
splitting the `game` god-module into its six domains, retiring the `api/db.ts` boot
DDL into numbered migrations, and turning the 19 `enable_*` columns into
plugin-declared capability assignments.
