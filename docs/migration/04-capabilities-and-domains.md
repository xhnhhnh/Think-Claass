# P4 — Capabilities and Domain Migration

**Status:** in progress (part 1 of 3 complete)
**Depends on:** [P3 plugin runtime](03-plugin-runtime.md)

P4 is the largest phase, so it lands in three parts:

| Part | Scope | Status |
|---|---|---|
| **4.1 Capability system** | Replace the 19 `enable_*` columns with scope-addressed capability assignments; make the compatibility layer generic | ✅ complete |
| **4.2 Audit sink** | Replace the hardcoded audit matcher with a descriptor registry and a kernel sink | ✅ complete |
| 4.3 `game` split + remaining domains + schema | Split the `game` god-module into its six domains as plugins; move the remaining backend domains; retire `api/db.ts` boot DDL into numbered migrations | ⬜ |

---

## P4.1 — Capability system

### The problem, precisely

`enable_*` existed in **four** places for every flag:

| Location | Form |
|---|---|
| `prisma/schema.prisma` → `model classes` | 19 `enable_*` integer columns |
| `api/utils/classFeatures.ts` | a hardcoded 19-element array, plus a `SELECT <19 columns>` |
| `src/lib/classFeatures.ts` | the same 19 keys, plus a label map and a route map |
| `api/modules/classroom/classroom.service.ts` | a loop over the array generating `UPDATE classes SET <col>` |

Adding one flag meant `ALTER TABLE classes` on a core table and edits in five
places. That is the clearest instance of "no extension point" in the codebase.

### What replaced it

**Kernel — `capability_assignments`** (`packages/kernel/src/permissions/capabilityStore.ts`)

```sql
CREATE TABLE capability_assignments (
  scope_type TEXT, scope_id INTEGER, capability_key TEXT,
  enabled INTEGER, updated_at TEXT,
  PRIMARY KEY (scope_type, scope_id, capability_key)
)
```

A capability is now a row addressed by scope, so adding one is a declaration rather
than a schema change. The store plugs into the existing `PermissionEngine`, which
already implements narrowest-scope-wins across student → class → school → platform,
and the kernel now uses the SQLite-backed store instead of the in-memory default —
so a teacher's toggle survives a restart.

**The 19 flags became a plugin declaration.** `plugins/classroom/plugin.json` now
declares them as class-scope permissions (`classroom.enable_shop`, …), each with its
label. The catalogue lives in one declarative file instead of two hardcoded arrays.

**`api/utils/classFeatures.ts` became generic and contains no key list at all.**

```ts
export function legacyKeysOf(row) {
  return Object.keys(row).filter((c) => c.startsWith('enable_')).sort();
}
```

The flag names are **derived from the class row**, so the schema is the list: a
column added by a future migration is picked up automatically. Values resolve
assignment-first, falling back to the legacy column.

### Dual write, and why

A toggle writes the capability assignment *and* mirrors the legacy column. The
assignment is authoritative; the mirror keeps any remaining direct column reader
correct during the transition. Nothing in the response shape changed.

### Verification on a running server

```
GET  /api/classes/1/features                    → 19 flags, unchanged shape
PUT  /api/classes/1/settings {"enable_shop":false}
  capability_assignments                        → class:1 classroom.enable_shop=0
  classes.enable_shop                           → 0   (mirrored)

# precedence: force the column back to 1 behind the API's back
UPDATE classes SET enable_shop = 1 WHERE id = 1
GET  /api/classes/1/features                    → enable_shop = False
```

That last line is the property that matters: the capability assignment is the
source of truth, and the legacy column is a fallback for classes that have never
been toggled.

### Ratchet

`legacyFeatureKeySurfaces` **2 → 1**. The measurement was also made honest: it now
counts files that *actually contain* keys, rather than files that merely exist, so
removing the backend list registers as progress instead of being masked by an empty
entry.

The remaining 1 is `src/lib/classFeatures.ts` — the frontend copy, which P5 removes
when menus and route gating come from plugin manifests.

### Also in this part

- `api/services/featureService.ts` reduced to a pure re-export facade, kept so
  existing `api/**` imports work; P7 deletes it.
- `auth.service.ts` now resolves login flags through the capability layer rather than
  reading the class row directly — one code path instead of two.
- The permission-key grammar was relaxed to allow underscores
  (`/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/`). Real permission names look like
  `classroom.enable_shop`; rejecting the underscore would have forced invented names
  for no benefit.

---

## What P4.3 still owes

- The `game` god-module still holds 79 route handlers for six domains
  (`battles`, `challenge`, `dungeon`, `economy`, `gacha`, `slg`), each of which has a
  service and repository but no module or controller of its own.
- `api/db.ts` still re-runs its full boot DDL and owns 78 `CREATE TABLE` statements
  outside the migration ledger.
- Seven `*.repository.prisma.ts` files and two dead service/util files still exist.

---

## P4.2 — Audit sink

### The problem, precisely

`api/utils/logMiddleware.ts` wrapped `res.json` and matched **four hardcoded paths**
with an if/else chain to synthesise Chinese action strings. Two consequences:

- anything not on those four paths was silently not audited at all;
- every entry was attributed with `req.body.teacherId || 1`, and the source carried
  the comment *"In a real app we'd get teacherId from session/token. Here we mock it
  as 1."* The request body is attacker-controlled, and the literal fallback meant
  unattributed actions were recorded against user 1.

### What replaced it

**A descriptor registry.** Whoever owns a route declares what it means:

```ts
{ method: 'POST', pattern: '/api/students/:id/points',
  action: '单个加/扣分', detail: '学生ID: {{id}}, 分数: {{amount}}, 理由: {{reason}}' }
```

The six descriptors that reproduce the baseline coverage now live in
`api/audit/descriptors.ts` as data. Adding one needs no middleware change, and
coverage is readable in one place instead of reconstructed from branch conditions.

**A kernel sink.** `createAuditLog` owns persistence and subscribes to
`kernel.request.audit`, so any module or plugin can emit an audit entry through the
event bus without importing the audit table.

**Attribution from the verified context.** `createAuditMiddleware` takes the actor
from the kernel's request context — the session token — never from the body.

### Details worth noting

- The middleware listens on `res.on('finish')` rather than wrapping `res.json`, so it
  fires regardless of which serialisation method a handler uses, and only for 2xx.
- Detail templates support `{{key?yes:no}}`, so `is_active` can render as 上架/下架
  without a descriptor needing code. Descriptors stay pure data, which is what lets
  them come from a plugin manifest when runtime installation arrives (P6).
- `Migration.up` may now be a **function**, not just SQL. SQLite has no
  `ADD COLUMN IF NOT EXISTS`, and repairing a partially migrated legacy table needs
  logic. The checksum covers the function source, so tamper detection still works.

### A latent baseline bug, found by the tests

`operation_logs` carried `REFERENCES users(id)` on **both** attribution columns, so an
audit entry for a user that does not exist — or has since been deleted — was rejected
by the foreign key, and the write was swallowed by the sink's error handler. Audit
history is supposed to outlive the records it describes.

The migration now rebuilds the table without those constraints, preserving every row.
SQLite cannot drop a constraint in place; the rebuild is safe inside the migration
transaction because nothing references `operation_logs`.

### Verification on a running server

```
POST /api/classes  {"name":"审计验证班"}      as x-user-id: 2 (superadmin)

operation_logs, newest first:
  id 21  teacher_id 2  user_id 2  role superadmin  创建班级  班级名称: 审计验证班   ← new
  id 20  teacher_id -  user_id 2  role superadmin  ADMIN_GENERATE_ACTIVATION_CODES
  id 19  teacher_id 1  user_id -  role -           单个加/扣分                    ← old
  id 18  teacher_id 1  user_id -  role -           创建班级  班级名称: Test        ← old
  id 17  teacher_id 1  user_id -  role -           更新商品状态                   ← old

PRAGMA foreign_key_list(operation_logs)  →  []      (constraints removed)
```

Rows 17–19 are the old behaviour preserved in the same table — attributed to user 1
with no role. Row 21 is the new one: the real actor, with both attribution columns
and the role populated.

### Also in this part

- `api/utils/logger.ts` was deleted. It had become a facade nothing imported, which
  the dead-code ratchet caught immediately; deleting it kept the ratchet at 70 rather
  than letting a pointless file raise the baseline.

---

## Tests

| Project | Files | Tests |
|---|---|---|
| `app` | 95 | 235 |
| `backend` | 11 | 175 |
| `guardrails` | 8 | 27 |
| **total** | **114** | **437** |

New in 4.1: `tests/kernel/capability-store.test.ts` covering scope isolation,
upsert semantics, persistence across a restart, seeding, and the precedence rules
that make the migration safe.

New in 4.2: `tests/kernel/audit-log.test.ts` (25 tests) covering registry matching
and precedence, detail rendering (including the boolean ternary), the sink's
attribution columns, the legacy-table repair, and the middleware's behaviour on
non-matching, failed, and repeated responses.

Four existing tests were updated rather than deleted, each because the code under
test genuinely changed:
`auth.login-class-context` now mocks the capability boundary instead of the row,
`classroom.service` asserts the capability call instead of the column loop, and the
plugin host test now expects the 19 classroom permissions alongside pet's two.

---

## What P4.2 and P4.3 still owe

- The `game` god-module still holds 79 route handlers for six domains
  (`battles`, `challenge`, `dungeon`, `economy`, `gacha`, `slg`), each of which has a
  service and repository but no module or controller of its own.
- `api/db.ts` still re-runs its full boot DDL and owns 78 `CREATE TABLE` statements
  outside the migration ledger.
- `api/utils/logMiddleware.ts` still matches four hardcoded paths to produce audit
  entries, with `teacherId` defaulting to `1`.
- Seven `*.repository.prisma.ts` files and two dead service/util files still exist.

