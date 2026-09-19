# P0 — Baseline Freeze

**Status:** complete
**Branch:** `refactor/plugin-kernel`
**Baseline tag:** `baseline-1.7.0`
**Baseline commit:** `74ed10019edec3f33d6b66f5f537c9e4e5dc599d` (`release: publish Think-Class v1.7.0`)
**Working copy:** `D:\think-class` (copied from `D:\ThinkClass\Think-Claass-main`, which remains untouched)
**Upstream:** `https://github.com/xhnhhnh/Think-Claass` (network unreachable from this machine — see *Environment* below)

---

## 1. Purpose

P0 does not change behaviour. It exists so that every later phase can be measured
against a frozen, reproducible, **green** baseline:

1. A working copy with git history preserved, on a dedicated branch, tagged.
2. Machine-generated metrics, so "the migration is working" is a number and not a feeling.
3. CI-enforced guardrails that make the *"表面插件化、实际仍然强耦合"* anti-pattern
   mechanically detectable instead of merely discouraged.
4. An HTTP surface snapshot, so relocating 288 endpoints into plugins cannot
   silently break clients.

---

## 2. Verified baseline metrics

All numbers below are produced by `npm run measure` and stored in
[`baseline.json`](baseline.json). They supersede the approximations used during
planning; where the two disagree, this file is authoritative.

### 2.1 Scale

| Metric | Value |
|---|---|
| Tracked files (git) | 754 |
| `src/` files / lines | 418 / 31,857 |
| `api/` files / lines | 151 / 18,622 |
| Tracked source files (`src` + `api`) | 569 |
| Test files | 95 |
| `@Controller` classes | 46 |
| HTTP handlers | **288** |
| Static `<Route>` in `AppRoutes.tsx` | **80** |
| Prisma models | 79 |
| Raw `CREATE TABLE` in `api/db.ts` | 78 |

> The planning document quoted 278 handlers and 82 routes. 288 is correct: the
> scanner expands multi-base controllers such as
> `@Controller(['api/classes', 'api/class'])` into both mount paths, and 80 is the
> true `<Route>` element count (`<Routes>` is not counted).

### 2.2 Schema drift — two data layers, one of them dead

| | Count |
|---|---|
| Models present in both Prisma and raw SQL | 77 |
| **Prisma-only** | `payment_orders`, `payment_transactions` |
| **Raw-SQL-only** | `messages_new` |

Corroborating findings (verified by reading the code):

- 7 `*.repository.prisma.ts` files (`battles`, `challenge`, `dungeon`, `economy`,
  `gacha`, `pet`, `slg`) are imported by **nothing**. Their `@Module` uses
  `useFactory: () => new XxxService(new SqliteXxxRepository())`.
- Prisma is reached by only 5 live files: `auth.service.ts`, `admin.repository.ts`,
  `admin.maintenance.ts`, `platform.service.ts`, `learning.service.ts`.
- `api/db.ts` is therefore the real data layer and is called directly from core
  utilities, e.g. `api/utils/classFeatures.ts` runs `SELECT ... FROM classes` with
  no repository in between.
- There is **no migration ledger** — no `_prisma_migrations`, no
  `PRAGMA user_version`. `initDb()` re-runs DDL on every boot, relying on
  `CREATE TABLE IF NOT EXISTS`, an `addColumnIfMissing` helper, and ad-hoc
  `ALTER TABLE` / rebuild-table statements (`messages` → `messages_new`, with
  `PRAGMA foreign_keys=off` at `api/db.ts:1250-1265`).

### 2.3 Dead code — 70 files unreachable from the application entry points

Computed by BFS over the import graph from `src/main.tsx`, `api/server.ts`,
`api/index.ts`; test files and ambient declarations excluded.

| Area | Files |
|---|---|
| `src/api/` | **31** (of 33 — only `parentBuff.ts`, `parentDashboard.ts` are live) |
| `src/hooks/` | 16 |
| `api/modules/` | 7 (the Prisma repositories) |
| `src/features/` | 7 |
| `src/components/` | 5 |
| `src/mocks/` | 2 |
| `api/services/` | 1 (`UserService.ts`) |
| `api/utils/` | 1 (`response.ts`) |

Notable: `src/components/ErrorBoundary.tsx` is implemented but **never mounted** —
the fault-isolation primitive the plugin architecture needs already exists and is
simply not wired up. It is scheduled to be revived in P5.

Full list: `deadCode.files` in [`baseline.json`](baseline.json).

### 2.4 Surface pluginization — the headline finding

`scripts/migration/measure.mjs` detects files whose entire content is a single
`export { default } from '<path>'` statement.

**62 of the 67 files under `src/features/*/pages/` are such shims.** Only 5 are real
implementations (`AdminDashboardPage`, `AdminLoginPage`, `AdminSettingsPage`,
`AdminSystemResetPage`, `TeacherEconomyPage`).

The genuine UI lives in `src/pages/<Role>/` — organised by **role**, not by domain.
The domain boundary only exists at the hook/transport layer, e.g.
`src/pages/Student/Pet.tsx` imports `@/features/pet/{petConfig,types,hooks/usePet}`
and nothing else from the domain.

`src/hooks/queries/useSettings.ts` is a shim too, and is not even counted above
because the scan only covers plugin-owned trees.

### 2.5 Extension points that must disappear

| Location | Content |
|---|---|
| `api/utils/classFeatures.ts` | 19 hardcoded `enable_*` keys |
| `src/lib/classFeatures.ts` | the same 19 keys, plus label and route maps |
| `prisma/schema.prisma` → `model classes` | 19 `enable_*` columns (45-column table) |

Adding one feature flag therefore requires an `ALTER TABLE classes` plus edits in
at least five places, two of which are inside core.

---

## 3. Pre-existing test failures found and fixed

**The baseline was not green.** The first full run produced:

```
Test Files  2 failed | 100 passed (102)
     Tests  4 failed | 250 passed (254)
```

| File | Test |
|---|---|
| `src/components/Layout/StudentLayout.test.tsx` | `filters disabled feature navigation items` |
| `src/components/Layout/StudentLayout.test.tsx` | `redirects to the first enabled student route when current route is disabled` |
| `src/components/Layout/ParentLayout.test.tsx` | `hides disabled family task navigation` |
| `src/components/Layout/ParentLayout.test.tsx` | `redirects away from disabled family tasks route` |

**Root cause (two independent defects):**

1. `StudentLayout` / `ParentLayout` → `CampusShell` → `WebsiteIcon` →
   `useSettings()` → React Query. The tests render the layouts directly without a
   `QueryClientProvider`, so the hook threw *"No QueryClient set"*. The production
   client is supplied in `AppProviders`; the tests were simply never updated when
   `WebsiteIcon` gained its query hook.
2. After adding the provider, `StudentLayout`'s positive assertion failed with
   `getMultipleElementsFoundError`: `CampusShell` renders the navigation **twice**
   (desktop sidebar + mobile drawer). `ParentLayout.test.tsx` already accounted for
   this by using `getAllByText`; `StudentLayout.test.tsx` did not.

**Fix:** wrap both tests' renders in `QueryClientProvider` (matching the convention
already used by the 9 other test files that render query-dependent components), and
switch the duplicated-text assertion to `getAllByText`.

No production file was modified — the change is confined to two test files.

> These two tests cover exactly the feature-flag gating that P4/P5 rewrite
> (`classFeatureKeys` → plugin-declared permissions, hardcoded nav arrays →
> `MenuRegistry`). Having them green *before* touching that code is a prerequisite,
> not a nicety.

---

## 4. Guardrails delivered

`npm run guard` — 7 files, 19 tests, ~3 s.

| # | Guard | File | Behaviour at P0 |
|---|---|---|---|
| G1 | A plugin may only reach another plugin via `<plugin>/public.ts` | [`plugin-boundaries.test.ts`](../../tests/guardrails/plugin-boundaries.test.ts) | passes (no `plugins/` yet) |
| G2 | Kernel / plugin-runtime never import `plugins/**` or `apps/**` | same file | passes |
| G3 | No one-line re-export shims in plugin-owned trees; dead-code ratchet | [`no-surface-pluginization.test.ts`](../../tests/guardrails/no-surface-pluginization.test.ts) | **ratchets 62 shims, 70 dead files** |
| G4 | Route table must not statically import plugin-owned pages | [`no-static-plugin-routes.test.ts`](../../tests/guardrails/no-static-plugin-routes.test.ts) | **ratchets 76 static imports** |
| G5 | Kernel contains no `enable_*`, no non-kernel SQL, no illegal imports; legacy feature-key surfaces ratchet | [`kernel-has-no-domain-knowledge.test.ts`](../../tests/guardrails/kernel-has-no-domain-knowledge.test.ts) | **ratchets 2 legacy surfaces** |
| G6 | `packages/contracts` stays type-only | [`contracts-is-type-only.test.ts`](../../tests/guardrails/contracts-is-type-only.test.ts) | passes (package not created yet) |
| G7 | Plugin manifests are well formed and tables are namespaced `p_<slug>_` | [`plugin-manifest-conformance.test.ts`](../../tests/guardrails/plugin-manifest-conformance.test.ts) | passes (no manifests yet) |
| G8 | HTTP surface frozen at 288 endpoints | [`api-surface-snapshot.test.ts`](../../tests/guardrails/api-surface-snapshot.test.ts) | **active, 288 endpoints** |

### Deviation from the plan: ratchets instead of expected failures

The plan said guardrails G3 and G5 would be "expected to fail" at P0. They are
implemented as **ratchets** instead: each compares the current violation count
against a recorded allowance in [`allowances.json`](../../tests/guardrails/lib/allowances.json)
and fails only if the count **grows**.

```
shimPages: 62   deadCode: 70   staticPluginRoutes: 76   legacyFeatureKeySurfaces: 2
```

Reasons for the change:

- A permanently-red suite trains people to ignore red, which destroys the signal
  exactly when the migration needs it most.
- A ratchet enforces the same rule (debt may not increase) while keeping
  *"red = you broke something"* true from P0 onwards.
- `no-surface-pluginization.test.ts` additionally asserts the allowances may only
  ever be lowered, so a regression cannot be "fixed" by editing the JSON.
- Every allowance is visible as a single number that must reach 0, which makes
  phase progress measurable.

**Targets:** `shimPages` → 0 (P5), `staticPluginRoutes` → 0 (P5),
`legacyFeatureKeySurfaces` → 0 (P4/P5), `deadCode` → 0 (P7).

---

## 5. Environment notes

| Item | Finding |
|---|---|
| Node / npm / pnpm | v24.16.0 / 12.0.2 / 11.5.2 |
| Network | **Blocked.** `registry.npmjs.org` and `github.com` both fail TLS (`The SSL connection could not be established`); `git ls-remote` fails with `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`. `npm ci` is therefore impossible; `node_modules` was copied from the source checkout (34,762 files, 586.7 MB, 0 failures). |
| Vitest under the sandbox | Vitest/Vite bundles its config with esbuild, which spawns a child process over a pipe. Under the confined file sandbox that fails with `spawn EPERM`. This affects **any** `vitest` invocation, including the untouched pre-existing suite, so it is an environment limitation rather than a project defect. Test runs in this session required an escalated permission. |
| Build output | `dist/` and `node_modules/` were deliberately not copied from the source tree (`dist` is a stale 86 MB build; both are reproducible). |

---

## 6. Reproducing this baseline

```bash
npm run measure          # human-readable metrics
npm run baseline         # regenerate docs/migration/baseline.json
node scripts/migration/measure.mjs --json

npm run api:surface            # print all 288 endpoints
npm run api:surface:check      # fail on drift (used by G8)
npm run api:surface:update     # re-freeze after an intentional change

npm run guard            # 7 files / 19 tests  (guardrails)
npm test                 # 102 files / 254 tests  (application)
npm run check            # tsc --noEmit
```

Verified state after P0:

```
npm test    Test Files  102 passed (102)     Tests  254 passed (254)
npm run guard  Test Files  7 passed (7)      Tests   19 passed (19)
npm run check  exit 0
```

---

## 7. Files added by P0

| Path | Purpose |
|---|---|
| `scripts/migration/lib/analysis.mjs` | Dependency-free static analysis: import graph, reachability, shim detection, HTTP surface extraction, schema/feature-key inventory. Shared by the CLI tools and the guardrails so there is one definition of each metric. |
| `scripts/migration/measure.mjs` | Baseline metrics report. |
| `scripts/migration/api-surface.mjs` | HTTP surface snapshot generator / checker. |
| `vitest.guardrails.config.ts` | Separate Vitest project for guardrails (node env, no MSW setup). |
| `tests/guardrails/lib/paths.mjs` | Ratchet helpers. |
| `tests/guardrails/lib/allowances.json` | Recorded allowances (lower only). |
| `tests/guardrails/*.test.ts` | The 8 guards described in §4. |
| `tests/guardrails/snapshots/api-surface.json` | Frozen 288-endpoint HTTP surface. |
| `docs/migration/00-baseline.md` | This document. |
| `docs/migration/baseline.json` | Machine-readable metrics. |

`package.json` gained six scripts (`guard`, `measure`, `measure:json`, `baseline`,
`api:surface`, `api:surface:check`, `api:surface:update`). No dependency was added.

---

## 8. P0 acceptance

| Criterion | Result |
|---|---|
| Working copy created, source tree untouched | ✅ `D:\think-class`, source still `D:\ThinkClass\Think-Claass-main` |
| Branch + baseline tag | ✅ `refactor/plugin-kernel`, `baseline-1.7.0` |
| Metrics reproducible | ✅ `npm run measure` / `baseline.json` |
| Existing tests green | ✅ 254/254 (4 pre-existing failures found and fixed) |
| Guardrails in place and green | ✅ 19/19, with 4 ratchets recorded |
| HTTP surface frozen | ✅ 288 endpoints |
| Typecheck | ✅ `tsc --noEmit` exit 0 |

**Next:** P1 — pnpm workspace, `packages/{kernel,contracts,plugin-sdk,plugin-sdk-react,db}`,
`createKernel()` booting with **zero plugins**, and the technical spike on whether
NestJS controllers can be registered at runtime (risk R10 in the plan).
