# P2 — Contract Consolidation and Authentication Hardening

**Status:** complete
**Depends on:** [P1 kernel and workspace](01-kernel.md)
**Gate result:** `npm test` 108 files / 317 tests green · `tsc --noEmit` exit 0 · 288 endpoints unchanged · backend→frontend imports reduced to **0**

---

## 1. What P2 delivers

Two things the plan called out, both now verified against a running server:

1. **One contract home.** The backend no longer imports the frontend source tree.
2. **Real sessions.** Identity comes from a verified token; the `x-user-role` /
   `x-user-id` headers the server used to trust verbatim are now an explicit bridge
   that a single switch turns off.

---

## 2. Contract consolidation

### Before

| Direction | Mechanism | Sites |
|---|---|---|
| backend → frontend | `'../../../src/shared/pet/contracts.js'` | 16 |
| frontend → shared | `'@/shared/pet/contracts'` | 56 |

`packages/contracts` was type-only (guardrail G6), and the tree contained exactly one
runtime value: `DEFAULT_SYSTEM_SETTINGS` in `src/shared/admin/contracts.ts`.

### After

```
packages/contracts/src/domains/<17 domains>.ts   moved verbatim, intra-tree imports fixed
packages/contracts/src/domains/index.ts          export type * from each
src/shared/                                      DELETED
```

- Backend and frontend both import `@thinkclass/contracts/domains/<domain>`.
- The domain subpath is not re-exported from the package root: two domains may
  legitimately declare the same DTO name, and a merged root surface would turn that
  into a silent conflict.
- `domains/core.ts` was **not** created — the HTTP envelope it held already lives in
  `packages/contracts/src/http.ts` from P1.

Done by [`scripts/migration/move-shared-contracts.mjs`](../../scripts/migration/move-shared-contracts.mjs),
which refuses to run if any moved file still has a runtime export.

### The one runtime value

`DEFAULT_SYSTEM_SETTINGS` could not follow the types:

- `packages/contracts` is type-only (G6), so it cannot hold a value.
- The **backend** cannot import a frontend module.
- The **frontend** cannot import `@thinkclass/kernel` — that would pull `express` and
  `better-sqlite3` into the browser bundle.

So it exists twice, both emitted from the same source block:

| Copy | Path |
|---|---|
| backend | `api/modules/admin/admin.defaults.ts` |
| frontend | `src/lib/systemSettings.ts` |

Duplication is a real cost, so it is made safe rather than merely documented:
guardrail **G9** (`tests/guardrails/system-settings-parity.test.ts`) parses both
object literals statically and fails on any added, removed or changed key or value,
and additionally asserts the frontend copy never imports the kernel or `api/`.
P4/P5 removes both when the admin plugin declares its settings.

---

## 3. Authentication hardening

### The hole

`src/lib/api.ts` set `x-user-role` / `x-user-id` from the local store and
`api/utils/requestAuth.ts` read them with no verification, so **any client could
become a superadmin by editing a request header**.

### The replacement

| Piece | Where |
|---|---|
| `sessions` table, tokens stored as SHA-256 digests | `packages/kernel/src/auth/session.ts` |
| Bearer-first actor resolution | `packages/kernel/src/http/requestContext.ts` |
| `AuthProvider` port (kernel does not know where credentials live) | `packages/kernel/src/auth/authProvider.ts` |
| `POST /api/kernel/auth/login` issuing a session | `packages/kernel/src/http/kernelRoutes.ts` |
| Bridge adapter over the existing credential check | `api/modules/auth/legacyAuthProvider.ts` |
| Legacy `/api/auth/login` and `/api/admin/session` now also return a token | `auth.controller.ts`, `admin.controllers.ts` |
| Frontend stores the token and sends `Authorization: Bearer` | `src/store/useStore.ts`, `src/lib/api.ts`, `Login.tsx`, `AdminLoginPage.tsx` |

`ALLOW_LEGACY_HEADER_AUTH` (default **on**) controls the bridge. Every bridged
request logs `legacy header auth used`, so the bridge is visible in logs rather than
silently permanent.

### Two defects found while building it

1. **Credential downgrade (security).** The first implementation verified a Bearer
   token and, on failure, fell through to the header bridge. Presenting a *revoked*
   token alongside forged headers therefore still authenticated. My own test
   `a forged header cannot resurrect a revoked session` caught it. A presented
   credential is now final: invalid means anonymous, and the bridge is consulted only
   when **no** token was sent at all.

2. **401 and 403 were the same thing.** `requireActorRole` threw 403 for both
   "unknown caller" and "known caller, insufficient role", so an expired session
   looked like a permissions problem. It now returns 401 when there is no identity
   and 403 when the identity lacks the role. `api/modules/admin/admin.module.test.ts`
   was updated to assert both, instead of only 403.

### Not yet covered (deliberately, P4)

Only routes that call `requireActorRole` are guarded; most student/teacher routes
read `getRequestActor()` and use `actor.id` directly. Systematic per-route
enforcement arrives with plugin-declared permissions in P4, where each route states
the permission it needs.

---

## 4. Verification

### Bridge OFF — `PORT=4560 ALLOW_LEGACY_HEADER_AUTH=0 npx tsx api/server.ts`

```
forged x-user-role: superadmin on /api/admin/system/stats   -> HTTP 401   (was 200)
POST /api/auth/login {superadmin}                           -> success, token issued
GET  /api/kernel/auth/me  (Bearer <token>)                  -> {"actor":{"userId":2,"role":"superadmin"},
                                                                 "authSource":"bearer"}
GET  /api/admin/system/stats (Bearer <same token>)          -> HTTP 200
```

The middle two together are the point: the same request that a forged header could
not get past succeeds with a token, and the token path is distinguishable in the
response (`authSource: "bearer"`).

### Bridge ON — default mode

```
GET  /api/settings                       -> 200  existing business route unaffected
GET  /api/admin/system/stats              (legacy headers)          -> 200  bridge works
GET  /api/kernel/info                    -> 200  kernel routes available in legacy mode
GET  /api/admin/system/stats  (Bearer bogus + forged headers)       -> 401  no downgrade
```

The last line is the escalation fix confirmed in the real application, not only in
unit tests.

### Suites

| Project | Files | Tests |
|---|---|---|
| `app` | 95 | 235 |
| `kernel` | 5 | 59 |
| `guardrails` | 8 | 23 |
| **total** | **108** | **317** |

Ratchets unchanged: 62 shims, 70 dead files, 76 static plugin routes, 2 legacy
feature-key surfaces. The API surface snapshot still reports *"unchanged (288
endpoints)"*.

---

## 5. P2 acceptance

| Criterion | Result |
|---|---|
| `packages/contracts` carries the domain contracts | ✅ 17 domains, type-only |
| No backend import from `src/**` | ✅ 0 remaining |
| `src/shared` removed | ✅ |
| Single source of truth for shared types | ✅ both sides import `@thinkclass/contracts/domains/*` |
| Forged header rejected when bridge off | ✅ 401, verified on a running server |
| Sessions issued on login | ✅ `/api/auth/login`, `/api/admin/session`, `/api/kernel/auth/login` |
| Existing clients unaffected by default | ✅ bridge on by default, verified |
| Typecheck / tests / surface | ✅ 317 tests, tsc 0, 288 endpoints unchanged |

---

## 6. Carried into P3

- `getActiveKernel()` is a **service locator** introduced because `AuthService` is
  instantiated by a static Nest factory with no constructor seam. The identity plugin
  removes it.
- `api/modules/auth/legacyAuthProvider.ts` is the temporary `AuthProvider`
  implementation; P3 replaces it with the `identity` foundation plugin.
- The endpoint snapshot scanner reads only `api/**`; when controllers move into
  plugins in P4 it must also scan `plugins/**`, and the kernel's own express routes
  are invisible to it today.

**Next:** P3 — the plugin runtime (discovery, manifest validation, dependency
resolution, lifecycle, registries, migration runner, fault isolation, installation)
plus two reference plugins: `pet` (feature tier) and `classroom` (foundation tier,
supplying `ClassroomPort`).
