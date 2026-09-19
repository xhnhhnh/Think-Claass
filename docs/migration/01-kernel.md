# P1 — Kernel and Workspace Skeleton

**Status:** complete
**Depends on:** [P0 baseline freeze](00-baseline.md)
**Gate result:** `npm test` 106 files / 301 tests green · `npm run check` exit 0 · HTTP surface unchanged at 288 endpoints

---

## 1. What P1 delivers

A minimal core that boots and serves infrastructure endpoints with **zero plugins**,
coexisting with the untouched legacy application behind one switch.

```
KERNEL_ENABLED=1   ->  packages/kernel boots;  /api/health + /api/kernel/*   (verified)
otherwise          ->  legacy Nest composition, 14 static modules            (verified)
```

Both paths were booted through the real entry point (`npx tsx api/server.ts`) and
probed over HTTP; see §5.

---

## 2. Layout created

```
pnpm-workspace.yaml            apps/*  packages/*  plugins/*  plugins-ext/*
tsconfig.json                  + @thinkclass/* path aliases, + "packages" in include

packages/contracts/            type-only shared vocabulary   (guardrail G6)
  src/http.ts                  ApiSuccess/ApiFailure/PageResult/HealthStatus
  src/identity.ts              Actor, Role, ScopeRef, PermissionDeclaration
  src/events.ts                EventContracts + EventMeta/Handler/Disposable
  src/services.ts              ServiceContracts (the cross-plugin port registry)
  src/plugin.ts                PluginManifest and every declaration it carries

packages/kernel/               the minimal core
  src/bootstrap/createKernel.ts
  src/config/loadConfig.ts
  src/logging/logger.ts
  src/events/eventBus.ts
  src/permissions/permissionEngine.ts
  src/auth/password.ts
  src/auth/session.ts
  src/storage/connection.ts
  src/storage/migrations.ts
  src/http/errorEnvelope.ts
  src/http/requestContext.ts
  src/http/kernelRoutes.ts
  src/index.ts                 the public API surface

tests/kernel/                  kernel-boot, event-bus, permission-engine, migrations
scripts/migration/             measure.mjs, api-surface.mjs, class-features.mjs, route-modules.mjs
vitest.app.config.ts           app project (was vitest.config.ts)
vitest.kernel.config.ts        kernel project
vitest.config.ts               root, declares test.projects
```

### Deviation: workspace linking without a network

`pnpm install` is impossible here (npm registry and github are unreachable — see
[P0 §5](00-baseline.md)). The workspace is therefore declared in
`pnpm-workspace.yaml` and each package carries a correct `package.json`, but module
resolution currently works through **tsconfig `paths` + Vitest aliases** instead of
`node_modules` symlinks. Node's upward directory walk already finds root
`node_modules` for third-party deps (`express`, `better-sqlite3`), so nothing is
missing at runtime. A single `pnpm install` will activate real linking with no code
change when the network returns.

---

## 3. Spike R10 — NestJS runtime controller registration

The plan flagged this as the highest-risk unknown (risk R10) because all 46
controllers are statically declared in `api/app.module.ts` today. It is now
resolved with evidence: the R10 spike, 8/8 checks passing, was run with
`npm run spike:nest`.

> The spike script (`scripts/migration/spikes/nest-dynamic-controllers.mjs`) and its
> `spike:nest` npm script were **deleted by a later workspace cleanup**: the question is
> answered, the decision shipped, and the evidence it produced is recorded below. The
> script is recoverable from git history if the question is ever reopened.

**Answer: YES.** Controllers that are only known at runtime can be hosted, including
constructor DI. NestJS decorators are plain functions, so the plugin runtime builds
the module graph programmatically from the resolved plugin set before
`NestFactory.create()` — verified end to end over real HTTP.

Three findings that will shape P3/P4:

1. **Boot-time assembly works; runtime add/remove does not.**
   `container.addModule()` creates the module but **never registers its
   controllers** — `moduleRef.controllers.size === 0`, because controllers are only
   registered by `DependenciesScanner`, which `addModule()` bypasses. `registerRouter()`
   then mounts nothing. Hot *remove* has no public path either
   (`container.removeModule` does not exist).

   **Consequence:** the plugin set is an input to boot. Install / enable / disable /
   uninstall re-resolve the graph and restart the process. This is simpler, more
   deterministic and matches the existing PM2 deploy model, so it is adopted as the
   design rather than worked around.

2. **`Module()` returns `undefined`.**
   ```js
   const Root = Module({ controllers: [C] })(class RootModule {});  // Root === undefined
   ```
   The decorator is side-effecting and returns nothing, so calling it as a plain
   function and using the result yields `undefined`, which surfaces much later as a
   bare `TypeError` inside Nest's scanner. The plugin runtime must keep the class in
   a variable and return it explicitly.

3. **`abortOnError` defaults to `true` and hides the cause.** Nest calls
   `process.exit(1)` after logging through its own logger; with `logger: false` the
   process dies with exit code 1 and *no output at all*. Any kernel-side Nest
   bootstrap must pass `abortOnError: false`.

Scenario C also confirms two plugin modules can be mounted under separate namespaces
(`/api/p/alpha`, `/api/p/beta`) with no bleed between them.

---

## 4. Kernel design decisions

| Decision | Rationale |
|---|---|
| Kernel routes are plain express, not Nest | They are infrastructure, not business routes. Keeps the kernel framework-independent, so only the plugin host depends on Nest. |
| `PluginHostView` interface, empty implementation | P1 needs a real seam, not a stub scattered through the kernel. P3 supplies the runtime through `CreateKernelOptions.pluginHost`. |
| Sessions store `sha256(token)`, never the token | A database leak must not yield usable credentials. Verified constant-time comparison. |
| Permissions fail closed on an undeclared key | A typo must deny, not silently allow. |
| Scope chain narrowest-first, default last | Replaces the 19 `enable_*` columns on `classes` with assignments at student / class / school / platform scope. |
| `allowLegacyHeaderAuth` defaults **true** | The frontend still sends `x-user-role`/`x-user-id`; flipping this off in P2 is the breaking step, so it must be an explicit, loggable switch rather than a silent behaviour change. |
| Kernel owns only its own tables | Enforced by `checkTableOwnership`: the kernel may not touch a plugin's tables and vice versa. |
| Migration checksums | Editing an already-applied migration throws instead of silently diverging. |

### Things the kernel deliberately does NOT do

No business table, no business route, no `enable_*` identifier, no hardcoded menu or
route-path list. Guardrail **G5 is now load-bearing** (it previously had nothing to
scan) and passes against `packages/kernel/**`.

---

## 5. Verification evidence

### Kernel mode (`KERNEL_ENABLED=1 PORT=4555 npx tsx api/server.ts`)

```
[kernel] kernel starting {"env":"development","pluginsEnabled":false}
[kernel] migration applied {"id":"0002_kernel_sessions","owner":"kernel"}
[kernel] plugin host disabled; booting with zero plugins
[kernel] kernel ready {"migrationsApplied":1,"bootMs":24}

GET /api/health       200 {"success":true,"kernel":{"apiVersion":1,"plugins":{"total":0,"active":0,"degraded":0}}}
GET /api/kernel/info  200 {"kernelVersion":"1.0.0","apiVersion":1,"pluginsEnabled":false, ...}
GET /api/students     404
```

Boot cost: **24 ms**, one migration applied to the real `database.sqlite` (additive
only — a new `sessions` table, no existing table touched).

### Legacy mode (`PORT=4556 npx tsx api/server.ts`, no `KERNEL_ENABLED`)

```
GET /api/health       200 {"success":true,"message":"ok"}          <- legacy shape
GET /api/settings     200 {"success":true,"data":{"site_title":"Think-Class", ...}}
GET /api/kernel/info  404                                          <- kernel absent
```

### Suites

| Project | Files | Tests |
|---|---|---|
| `app` (jsdom + MSW) | 95 | 235 |
| `kernel` (node) | 4 | 47 |
| `guardrails` (node) | 7 | 19 |
| **total** | **106** | **301** |

`npm run check` (tsc) exit 0. `npm run api:surface:check` → *"API surface unchanged
(288 endpoints)"*.

---

## 6. Problems found and fixed during P1

These were real defects in the work, fixed rather than worked around:

1. **`vitest.workspace.ts` is silently ignored by Vitest 4.** Vitest 4 removed
   `defineWorkspace` in favour of `test.projects` in the root config. The first
   "passing" workspace run was in fact running only the app project — 95 files
   instead of 106. Fixed by declaring `test.projects` in `vitest.config.ts` and
   moving the app config to `vitest.app.config.ts`.
2. **The app project had no `include` scope**, so it also collected
   `tests/kernel/**` and `tests/guardrails/**`, ran them under jsdom where MSW
   (`onUnhandledRequest: 'error'`) intercepts the real `fetch` calls the kernel boot
   tests depend on. Fixed by scoping `include` to `src/**` and `api/**`.
3. **Guardrail G5 produced three classes of false positive**, all fixed:
   - `CREATE TABLE IF NOT EXISTS x` captured the table name `IF`;
   - `DROP TABLE IF EXISTS x` backtracked into `IF` as well, and once `DROP` was
     added to the keyword list it captured the word `TABLE`;
   - prose in JSDoc (`moved from \`api/utils/password.ts\``) was scanned as SQL.
   Additionally the alternation carried one capture group per branch, so `m[1]` was
   `undefined` for every branch but the first. Now: a single capture group,
   keyword-specific DDL branch, and comments blanked out position-preservingly.
4. **`extractTableOperations` in the kernel had the same latent backtracking bug**,
   which would have made P3's ownership enforcement reject legitimate migrations.
   Fixed pre-emptively and covered by tests.
5. **Reachability ignored workspace packages**, so `packages/**` counted as 89 dead
   files. `defaultEntryPoints()` now includes every `packages/*/src/index.ts`, which
   is why the dead-code ratchet sits at exactly 70 again.

---

## 7. P1 acceptance

| Criterion | Result |
|---|---|
| pnpm workspace skeleton | ✅ declared; resolution via tsconfig paths pending network for real linking |
| `packages/{kernel,contracts}` created | ✅ |
| Kernel boots with zero plugins | ✅ 24 ms, verified over HTTP |
| Kernel serves only `/api/health` + `/api/kernel/*` | ✅ business routes 404 |
| Legacy composition preserved | ✅ verified side by side |
| `packages/contracts` type-only | ✅ guardrail G6 active and passing |
| NestJS runtime registration PoC | ✅ spike R10: answer YES, constraint documented |
| Existing suites still green | ✅ 301/301 |
| Guardrails still green | ✅ 19/19, ratchets unchanged (62 shims / 70 dead / 76 static routes / 2 legacy surfaces) |

**Next:** P2 — move the 16 backend→frontend `src/shared` imports into
`packages/contracts`, turn on real session authentication with the legacy header
bridge as an explicit switch, and add runtime endpoint-contract tests alongside the
288-endpoint snapshot.
