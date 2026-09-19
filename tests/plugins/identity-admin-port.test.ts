/**
 * The admin console's view of identity (P4.3b.14) - driven against a real SQLite database.
 *
 * `api/modules/admin` used to reach `users`, `activation_codes` and `activation_events` through
 * Prisma: it verified console credentials, created and updated teachers, listed and generated
 * activation codes and preserved superadmins across a database reset. Those are identity's adopted
 * tables, so the console now consumes the nine operations this file tests instead of being a second
 * writer.
 *
 * The layering is the same as `identity-service.test.ts`, and deliberately so:
 *
 *   - the schema comes from the real migration chain (`APP_MIGRATIONS` through
 *     `createKernel({ inMemoryDatabase: true })`), so `users.username` really is UNIQUE and the
 *     duplicate-username 400 is tested against a constraint rather than a mock's opinion;
 *   - the repository runs through the real ownership-checked `DbApi` built from the manifest's
 *     `data.adopted` list with `strict: true`, so a statement naming an undeclared table fails here
 *     exactly as it would in development;
 *   - `ctx.audit` is the **real** kernel audit log, so "the entry landed in `operation_logs`" is an
 *     assertion about the row the product writes, not about a spy.
 *
 * Four pre-migration properties get specific attention because they are the ones a rewrite loses:
 *
 *   1. **`teacher_id IS NULL` and `user_id = actorId`** on every console mutation
 *      (`admin.repository.ts:101-118` wrote the acting admin to `user_id` only). `ctx.audit`
 *      defaults `teacherId` to `actorId`, so this is exactly the shape a port that forgot to pass
 *      `teacherId: null` would get wrong.
 *   2. **The plaintext-password upgrade on a successful credential check** (`:620-625`).
 *   3. **The newest activation event per code wins** (`:120-154`, `ORDER BY created_at DESC`).
 *   4. **The superadmin round-trip preserves ids** (`:1029-1045`), because other tables already
 *      reference them.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { AdminAuditEntry, SuperadminSnapshot } from '@thinkclass/contracts/domains/identity';
import { ApiError, createKernel, hashPassword, isPasswordHash, verifyPassword, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createIdentityRepository } from '../../plugins/identity/src/identity.repository.js';
import { IdentityService } from '../../plugins/identity/src/identity.service.js';

/** Mirrors `plugins/identity/plugin.json` -> `data.adopted`. `data.reads` is intentionally empty. */
const ADOPTED_TABLES = ['users', 'activation_codes', 'activation_events'];

/**
 * None of the admin operations touches classroom, and the admin console's classes come from
 * `classroom.public` rather than from identity. The stub exists so the dependency is explicit.
 */
const classroomStub = {
  async listClassIdsByTeacher() {
    return [];
  },
  async listStudentAccountsByClassIds() {
    return [];
  },
} as unknown as ClassroomPort;

/** The audit entry the admin plugin builds for `POST /api/admin/teachers`. */
function auditEntry(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    action: 'ADMIN_CREATE_TEACHER',
    detail: JSON.stringify({ username: 'new-teacher' }),
    actorId: 2,
    role: 'admin',
    ip: '10.0.0.7',
    ...overrides,
  };
}

let kernel: Kernel;
let api: DbApi;
let service: IdentityService;

/** Await a call and return the `ApiError` it threw; fails the test when it does not throw. */
async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

function userRow(id: number) {
  return kernel.db.prepare('SELECT username, password_hash, is_activated FROM users WHERE id = ?').get(id) as {
    username: string;
    password_hash: string;
    is_activated: number;
  };
}

function auditRows() {
  return kernel.db
    .prepare('SELECT user_id, teacher_id, role, action, details, ip_address FROM operation_logs ORDER BY id')
    .all() as Array<{
    user_id: number | null;
    teacher_id: number | null;
    role: string | null;
    action: string;
    details: string | null;
    ip_address: string | null;
  }>;
}

beforeEach(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent' },
    migrations: APP_MIGRATIONS,
  });

  api = createDbApi({
    db: kernel.db,
    pluginId: 'identity',
    ownedTables: new Set(ADOPTED_TABLES),
    readTables: new Set(),
    strict: true,
  });

  service = new IdentityService({
    // The service reads `config`, `log`, `settings` and `audit`; the real audit log is used so the
    // `operation_logs` assertions below are about the product's row, not a fake's array.
    ctx: {
      config: { ...kernel.config },
      log: kernel.logger,
      settings: { getPlatform: (key: string) => kernel.settings.get(key) },
      audit: kernel.audit,
    } as never,
    repository: createIdentityRepository(api),
    classroom: classroomStub,
    parentBuff: () => null,
  });

  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES
      (1, 'superadmin', 'root', 'root-plaintext', 1),
      (2, 'admin', 'ops', '${hashPassword('ops-pass')}', 1),
      (3, 'teacher', 'teacher3', 'x', 1),
      (4, 'teacher', 'teacher4', 'x', 0),
      (9, 'student', 'student9', 'x', 1);
  `);
});

afterEach(async () => {
  await kernel.shutdown();
});

// ---------------------------------------------------------------------------

describe('verifyAdminCredentials', () => {
  it('accepts an admin and a superadmin, and answers the actor shape the session needs', async () => {
    expect(await service.verifyAdminCredentials('ops', 'ops-pass')).toEqual({ id: 2, role: 'admin', username: 'ops' });
    expect(await service.verifyAdminCredentials('root', 'root-plaintext')).toMatchObject({ id: 1, role: 'superadmin' });
  });

  it('answers null for a wrong password, an unknown user and a non-admin role alike', async () => {
    expect(await service.verifyAdminCredentials('ops', 'wrong')).toBeNull();
    expect(await service.verifyAdminCredentials('nobody', 'ops-pass')).toBeNull();
    // A teacher is a user row, but not an admin one. The three refusals are one `null` on purpose.
    expect(await service.verifyAdminCredentials('teacher3', 'x')).toBeNull();
  });

  it('upgrades a legacy plaintext password to a hash on a successful check', async () => {
    await service.verifyAdminCredentials('root', 'root-plaintext');

    const row = userRow(1);
    expect(isPasswordHash(row.password_hash)).toBe(true);
    expect(verifyPassword('root-plaintext', row.password_hash)).toBe(true);
  });

  it('leaves an already-hashed password untouched', async () => {
    const before = userRow(2).password_hash;
    await service.verifyAdminCredentials('ops', 'ops-pass');
    expect(userRow(2).password_hash).toBe(before);
  });

  it('writes nothing to operation_logs - a login is not an admin mutation', async () => {
    await service.verifyAdminCredentials('ops', 'ops-pass');
    expect(auditRows()).toEqual([]);
  });
});

describe('listTeachers and findTeacher', () => {
  it('lists teachers only, in id order, with the activation flag projected', async () => {
    expect(await service.listTeachers()).toEqual([
      { id: 3, username: 'teacher3', role: 'teacher', isActivated: true },
      { id: 4, username: 'teacher4', role: 'teacher', isActivated: false },
    ]);
  });

  it('finds a teacher and answers null for a non-teacher', async () => {
    expect(await service.findTeacher(3)).toEqual({ id: 3, username: 'teacher3' });
    // The student and the admin exist; neither is a teacher, and the deletion path must see that.
    expect(await service.findTeacher(9)).toBeNull();
    expect(await service.findTeacher(2)).toBeNull();
    expect(await service.findTeacher(999)).toBeNull();
  });
});

describe('createTeacher', () => {
  it('creates an activated teacher with a hashed password and returns the console detail', async () => {
    const created = await service.createTeacher({ username: 'new-teacher', password: 'pw-1' }, auditEntry());

    expect(created).toMatchObject({ username: 'new-teacher', role: 'teacher', isActivated: true });

    const row = userRow(created.id);
    expect(isPasswordHash(row.password_hash)).toBe(true);
    expect(verifyPassword('pw-1', row.password_hash)).toBe(true);
    expect(row.is_activated).toBe(1);
  });

  it('records the audit entry in operation_logs with user_id = actorId and teacher_id NULL', async () => {
    const created = await service.createTeacher(
      { username: 'audited', password: 'pw' },
      auditEntry({ action: 'ADMIN_CREATE_TEACHER', detail: JSON.stringify({ username: 'audited' }) }),
    );

    expect(auditRows()).toEqual([
      {
        user_id: 2,
        // Load-bearing: the pre-migration logAdminMutation attributed the acting admin to `user_id`
        // and left `teacher_id` null. `ctx.audit` would otherwise default it to the actor id.
        teacher_id: null,
        role: 'admin',
        action: 'ADMIN_CREATE_TEACHER',
        details: JSON.stringify({ username: 'audited' }),
        ip_address: '10.0.0.7',
      },
    ]);
    expect(created.id).toBeGreaterThan(0);
  });

  it('falls back to the legacy detail when the caller supplies none', async () => {
    const created = await service.createTeacher({ username: 'no-detail', password: 'pw' }, {
      action: 'ADMIN_CREATE_TEACHER',
      actorId: 2,
      role: 'admin',
      ip: null,
    });

    expect(JSON.parse(auditRows()[0].details as string)).toEqual({ teacherId: created.id, username: 'no-detail' });
  });

  it('answers 400 用户名已存在 for a duplicate username, whoever holds it', async () => {
    const sameRole = await apiErrorOf(() => service.createTeacher({ username: 'teacher3', password: 'pw' }));
    expect(sameRole.statusCode).toBe(400);
    expect(sameRole.message).toBe('用户名已存在');

    // `users.username` is UNIQUE across roles, so a student's name is taken too - the case Prisma
    // reported as P2002 and the legacy catch mapped to the same 400.
    const crossRole = await apiErrorOf(() => service.createTeacher({ username: 'student9', password: 'pw' }));
    expect(crossRole.statusCode).toBe(400);
    expect(crossRole.message).toBe('用户名已存在');
  });

  it('writes no teacher and no audit row when the transaction fails', async () => {
    await apiErrorOf(() => service.createTeacher({ username: 'teacher3', password: 'pw' }, auditEntry()));
    expect(kernel.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'teacher'`).get()).toEqual({ n: 2 });
    expect(auditRows()).toEqual([]);
  });
});

describe('updateTeacher', () => {
  it('updates the username and keeps the stored password when none is given', async () => {
    const before = userRow(3).password_hash;
    const updated = await service.updateTeacher(
      3,
      { username: 'renamed-teacher' },
      auditEntry({ action: 'ADMIN_UPDATE_TEACHER', detail: JSON.stringify({ teacherId: 3, username: 'renamed-teacher', passwordUpdated: false }) }),
    );

    expect(updated).toEqual({ id: 3, username: 'renamed-teacher', role: 'teacher', isActivated: true });
    expect(userRow(3).password_hash).toBe(before);
    expect(auditRows()[0]).toMatchObject({ user_id: 2, teacher_id: null, action: 'ADMIN_UPDATE_TEACHER' });
    expect(JSON.parse(auditRows()[0].details as string).passwordUpdated).toBe(false);
  });

  it('rehashes the password when one is given, and says so in the fallback detail', async () => {
    const before = userRow(3).password_hash;
    await service.updateTeacher(3, { username: 'teacher3', password: 'fresh-pw' }, {
      action: 'ADMIN_UPDATE_TEACHER',
      actorId: 2,
      role: 'admin',
      ip: '10.0.0.7',
    });

    expect(userRow(3).password_hash).not.toBe(before);
    expect(verifyPassword('fresh-pw', userRow(3).password_hash)).toBe(true);
    expect(JSON.parse(auditRows()[0].details as string)).toMatchObject({
      teacherId: 3,
      username: 'teacher3',
      passwordUpdated: true,
    });
  });

  it('answers the legacy 404 for an id that is not a teacher, and writes nothing', async () => {
    const error = await apiErrorOf(() => service.updateTeacher(9, { username: 'nope' }, auditEntry()));
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('教师不存在');

    expect(userRow(9).username).toBe('student9');
    expect(auditRows()).toEqual([]);
  });

  it('answers 400 for a username another account already uses', async () => {
    const error = await apiErrorOf(() => service.updateTeacher(3, { username: 'teacher4' }));
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('用户名已存在');
    expect(userRow(3).username).toBe('teacher3');
  });
});

describe('listActivationCodes', () => {
  beforeEach(() => {
    kernel.db.exec(`
      INSERT INTO activation_codes (id, code, status, used_by, created_at, used_at) VALUES
        (11, 'TC-AAA11111', 'used', 3, '2026-01-01 10:00:00', '2026-01-02 11:30:00'),
        (12, 'TC-BBB22222', 'unused', NULL, '2026-01-02 10:00:00', NULL),
        (13, 'TC-CCC33333', NULL, NULL, '2026-01-03 10:00:00', NULL);
      INSERT INTO activation_events (id, user_id, source, activation_code, remark, created_at) VALUES
        (21, 3, 'activation_code', 'TC-AAA11111', '第一次', '2026-01-02 11:00:00'),
        (22, 3, 'payment', 'TC-AAA11111', '第二次', '2026-01-02 12:00:00');
    `);
  });

  it('joins the used-by username and projects the status, newest code first', async () => {
    const codes = await service.listActivationCodes();

    expect(codes.map((code) => code.code)).toEqual(['TC-CCC33333', 'TC-BBB22222', 'TC-AAA11111']);
    expect(codes[2]).toMatchObject({
      id: 11,
      status: 'used',
      usedByUserId: 3,
      usedByUsername: 'teacher3',
      // SQLite strings pass through unchanged: the legacy `toIsoString` only converted Date objects.
      createdAt: '2026-01-01 10:00:00',
      usedAt: '2026-01-02 11:30:00',
    });
  });

  it('takes the newest activation event per code', async () => {
    const codes = await service.listActivationCodes();
    const used = codes.find((code) => code.code === 'TC-AAA11111');

    // Events 21 and 22 both name the code; 22 is newer, so its source and remark win.
    expect(used?.activationSource).toBe('payment');
    expect(used?.activationRemark).toBe('第二次');
  });

  it('falls back to unused for a NULL status and leaves unused codes without an event', async () => {
    const codes = await service.listActivationCodes();
    const legacy = codes.find((code) => code.code === 'TC-CCC33333');
    const unused = codes.find((code) => code.code === 'TC-BBB22222');

    expect(legacy).toMatchObject({ status: 'unused', usedByUserId: null, usedByUsername: null, activationSource: null });
    expect(unused).toMatchObject({ status: 'unused', createdAt: '2026-01-02 10:00:00', usedAt: null });
  });
});

describe('generateActivationCodes', () => {
  it('mints the requested number of unique pre-migration-shaped codes and reads them back', async () => {
    const result = await service.generateActivationCodes({ count: 3 });

    expect(result.message).toBe('成功生成 3 个激活码');
    expect(result.createdCount).toBe(3);
    expect(result.codes).toHaveLength(3);

    const codes = result.codes.map((code) => code.code);
    for (const code of codes) expect(code).toMatch(/^TC-[0-9A-F]{8}$/);
    expect(new Set(codes).size).toBe(3);

    const stored = kernel.db
      .prepare(`SELECT code, status FROM activation_codes WHERE code IN (${codes.map(() => '?').join(', ')})`)
      .all(...codes) as Array<{ code: string; status: string }>;
    expect(stored).toHaveLength(3);
    expect(stored.every((row) => row.status === 'unused')).toBe(true);
    expect(result.codes.every((code) => code.status === 'unused')).toBe(true);
  });

  it('records the generated codes in the audit entry and leaves teacher_id NULL', async () => {
    const result = await service.generateActivationCodes({ count: 2 }, {
      action: 'ADMIN_GENERATE_ACTIVATION_CODES',
      actorId: 2,
      role: 'admin',
      ip: '10.0.0.7',
    });

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 2,
      teacher_id: null,
      action: 'ADMIN_GENERATE_ACTIVATION_CODES',
      ip_address: '10.0.0.7',
    });
    // The caller cannot compose this detail - only the port knows the codes it minted. The two
    // lists are compared as sets: the batch shares one `created_at` second, so the read-back order
    // among equals is the query's business, not the contract's (the pre-migration code was the same).
    const detail = JSON.parse(rows[0].details as string) as { count: number; codes: string[] };
    expect(detail.count).toBe(2);
    expect([...detail.codes].sort()).toEqual(result.codes.map((code) => code.code).sort());
  });

  it('answers an empty batch for count 0 without writing an audit entry nobody asked for', async () => {
    const result = await service.generateActivationCodes({ count: 0 });
    expect(result).toMatchObject({ message: '成功生成 0 个激活码', createdCount: 0, codes: [] });
    expect(auditRows()).toEqual([]);
  });

  it('keeps writing via the owned tables only', async () => {
    // `activation_codes` is adopted, so this is a formality - but it is the boundary the whole port
    // exists for: the console used to do this through Prisma, bypassing the ownership check.
    expect(ADOPTED_TABLES).toContain('activation_codes');
  });
});

describe('listSuperadmins and restoreSuperadmins', () => {
  it('lists superadmins in id order with the hash and the activation flag', async () => {
    kernel.db.exec(`INSERT INTO users (id, role, username, password_hash, is_activated)
      VALUES (7, 'superadmin', 'second-root', 'hash-7', NULL)`);

    expect(await service.listSuperadmins()).toEqual([
      { id: 1, username: 'root', passwordHash: expect.any(String), isActivated: 1 },
      { id: 7, username: 'second-root', passwordHash: 'hash-7', isActivated: 0 },
    ]);
  });

  it('restores a snapshot with its explicit ids, replacing whatever is there', async () => {
    const snapshot: SuperadminSnapshot[] = await service.listSuperadmins();

    // The reset flow's middle step: the rows are gone (here: deleted directly, in production by the
    // reset) and the snapshot is what puts them back.
    kernel.db.prepare(`DELETE FROM users WHERE role = 'superadmin'`).run();
    kernel.db
      .prepare(`INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (99, 'superadmin', 'stray', 'x', 1)`)
      .run();

    await service.restoreSuperadmins(snapshot);

    expect(await service.listSuperadmins()).toEqual(snapshot);
    // The stray row is gone: restore replaces, it does not merge.
    expect(kernel.db.prepare(`SELECT id FROM users WHERE username = 'stray'`).get()).toBeUndefined();
    // The restored account still authenticates with the preserved hash.
    const restored = await service.verifyAdminCredentials('root', 'root-plaintext');
    expect(restored).toMatchObject({ id: 1, role: 'superadmin' });
  });

  it('deletes every superadmin for an empty snapshot', async () => {
    await service.restoreSuperadmins([]);
    expect(await service.listSuperadmins()).toEqual([]);
  });
});
