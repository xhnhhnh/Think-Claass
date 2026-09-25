/**
 * classroom: who may read and change student data.
 *
 * Every route in `plugins/classroom` answered anyone - no headers, no token - with real data:
 * the roster (`GET /api/students`), a student profile (`GET /api/students/:id`), the point
 * ledger (`GET /api/students/records`), the progress-star board, the class feature flags, the
 * attendance and leave records, the teacher presets, and every write (points, check-ins,
 * gifts, birthdays, batch imports, account creation, password resets, peer reviews, attendance,
 * leaves). And even a valid teacher credential returned *every* student in the school rather
 * than the teacher's own classes, on every one of those routes.
 *
 * This file pins the whole authorization contract over real HTTP against a real kernel, real
 * plugins and a real SQLite database. `ClassroomService` resolves the caller from the kernel's
 * verified request context (401 when there is none) and then narrows the answer to what the
 * role owns: a teacher owns classes, a student owns one row, a parent owns their linked
 * children, admin/superadmin own everything.
 *
 * What the test pins, and why each matters:
 *
 *   1. **Anonymous is 401, not 403.** The kernel's contract is "401 when we do not know who you
 *      are, 403 when we do" - the same split `plugins/learning` uses - and the reads and writes
 *      alike refuse before any validation message can describe a payload.
 *   2. **A teacher sees and touches only their own classes.** Teacher A owns class 11 (students
 *      110/111), teacher B owns class 12 (student 112). Each must be blind to the other's
 *      roster, points, ledger, birthdays, achievements, attendance, leaves and feature flags -
 *      the assertion the pre-fix code failed with full marks, because it answered everyone the
 *      same three rows.
 *   3. **Request parameters cannot widen a scope.** `?classId=<someone else's class>` is a 403,
 *      `?teacherId=<other teacher>` is ignored in favour of the actor, and a batch containing
 *      one foreign student id is refused as a whole. A query parameter is never a bypass.
 *   4. **The dangerous writes are gone.** `POST /api/students/batch-edit` with
 *      `action: 'reset_password'` (the migration matrix's P0 account-takeover route) is gated
 *      exactly like `PUT /api/students/:id/password`; points, feature flags and account
 *      creation all resolve their owner from the actor instead of the body.
 *   5. **A student sees only their own row, a parent only their linked children** - including
 *      on the per-student reads, the ledger, attendance and leaves, and the writes a student or
 *      parent is entitled to (check-in, gift from their own account, peer review, filing leave,
 *      rewarding their own child).
 *   6. **`GET /api/classes/invite/:code` stays fully public.** The activation page calls it
 *      before login (`src/features/auth/api/authApi.ts`), so an anonymous 200 there is part of
 *      the contract - and the unbound student it lists is exactly why that route must not gain
 *      an actor check.
 *
 * The scaffolding mirrors `tests/plugins/host.test.ts` (real `createKernel` + real
 * `createPluginHost`, listening on an ephemeral port) because these are HTTP status codes and
 * result sets, not controller return values: only the wire shows a 401 rendered by the
 * kernel's error filter. The order of the `describe` blocks is load-bearing: the read
 * assertions run before the write assertions, so the seeded ledger is not perturbed by them.
 */

import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel;
let host: PluginHost | null = null;
let server: Server;
let base: string;

const tokens: Record<'teacherA' | 'teacherB' | 'student' | 'parent' | 'admin', string> = {
  teacherA: '',
  teacherB: '',
  student: '',
  parent: '',
  admin: '',
};

beforeAll(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: {
      logLevel: 'silent',
      pluginsEnabled: true,
      pluginDirs: [],
      env: 'test',
    },
    migrations: APP_MIGRATIONS,
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        // The identity plugin registers its credential verifier during setup; without the
        // holder its setup fails loudly (see `ctx.auth.registerProvider`).
        authProvider: { current: null },
      });
      return host;
    },
  });

  // Seeded after boot, like `host.test.ts`: plugin setup does not read these tables.
  //
  // Student 113 has no login row on purpose. It is what the invite lookup returns (the
  // activation flow lists unbound students) and it is also why the roster reads, which INNER
  // JOIN `users`, list 110/111/112 and not 113 - the legacy projection, unchanged here.
  //
  // The three ledger rows are dated `datetime('now')` because `GET /api/students/progress-star`
  // only counts the last seven days.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash) VALUES
      (1, 'superadmin', 'root', 'x'),
      (107, 'teacher', 'teacher107', 'x'),
      (109, 'teacher', 'teacher109', 'x'),
      (121, 'student', 'student121', 'x'),
      (122, 'student', 'student122', 'x'),
      (123, 'student', 'student123', 'x'),
      (130, 'parent', 'parent130', 'x');

    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES
      (11, '一班', 107, 'ABC123'),
      (12, '二班', 109, 'XYZ789');

    INSERT INTO students (id, user_id, class_id, name, total_points) VALUES
      (110, 121, 11, '小明', 30),
      (111, 122, 11, '小红', 10),
      (112, 123, 12, '小刚', 20),
      (113, NULL, 11, '还没登录的学生', 0);

    INSERT INTO parent_students (parent_id, student_id) VALUES (130, 110);

    INSERT INTO records (id, student_id, type, amount, description, created_at) VALUES
      (1000, 110, 'ADD_POINTS', 5, '一班小明', datetime('now')),
      (1001, 111, 'ADD_POINTS', 5, '一班小红', datetime('now')),
      (1002, 112, 'ADD_POINTS', 5, '二班小刚', datetime('now'));

    INSERT INTO attendance_records (id, class_id, student_id, date, status) VALUES
      (2000, 11, 110, '2026-01-05', 'present'),
      (2001, 11, 111, '2026-01-05', 'absent'),
      (2002, 12, 112, '2026-01-05', 'present');

    INSERT INTO leave_requests (id, student_id, parent_id, start_date, end_date, reason, status) VALUES
      (3000, 110, 130, '2026-01-06', '2026-01-07', '一班小明的病假', 'pending'),
      (3001, 112, 130, '2026-01-06', '2026-01-07', '二班小刚的病假', 'pending');

    INSERT INTO point_presets (id, label, amount, teacher_id) VALUES
      (4000, '一班加分', 5, 107),
      (4001, '二班加分', 5, 109);
  `);

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // The session actor carries only `(userId, role)`; the scope (which class, which children)
  // is resolved inside the service from those ids, exactly as a real login resolves it.
  tokens.teacherA = kernel.sessions.issue({ userId: 107, role: 'teacher', ttlMs: 300_000 }).token;
  tokens.teacherB = kernel.sessions.issue({ userId: 109, role: 'teacher', ttlMs: 300_000 }).token;
  tokens.student = kernel.sessions.issue({ userId: 121, role: 'student', ttlMs: 300_000 }).token;
  tokens.parent = kernel.sessions.issue({ userId: 130, role: 'parent', ttlMs: 300_000 }).token;
  tokens.admin = kernel.sessions.issue({ userId: 1, role: 'superadmin', ttlMs: 300_000 }).token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel?.shutdown();
});

/** One request. A missing `token` means *anonymous* - no headers at all, which is the point. */
async function call(
  method: string,
  endpoint: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** Student ids of a roster answer, sorted: the reads carry no ORDER BY contract. */
function studentIds(body: any): number[] {
  return (body?.students ?? []).map((student: any) => student.id).sort((a: number, b: number) => a - b);
}

/** Concrete (student, amount, description) triples of a ledger answer, order-insensitive. */
function ledgerRows(body: any): Array<[number, number, string]> {
  return (body?.records ?? [])
    .map((record: any) => [record.student_id, record.amount, record.description] as [number, number, string])
    .sort((a: [number, number, string], b: [number, number, string]) => a[0] - b[0] || a[1] - b[1]);
}

/** Distinct student ids of an attendance/leave answer. */
function rowStudentIds(body: any): number[] {
  return [...new Set<number>((body?.data ?? []).map((row: any) => row.student_id as number))];
}

const ANONYMOUS = { success: false, message: '未登录或登录已过期' };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe('classroom student reads: anonymous callers', () => {
  it.each([
    ['GET', '/api/students'],
    ['GET', '/api/students/110'],
    ['GET', '/api/students/records'],
    ['GET', '/api/students/progress-star'],
  ])('%s %s answers 401 and no data', async (method, endpoint) => {
    const { status, body } = await call(method, endpoint);

    expect(status, `${method} ${endpoint} must refuse an anonymous caller`).toBe(401);
    expect(body).toEqual(ANONYMOUS);
    expect(JSON.stringify(body)).not.toContain('小明');
  });
});

describe('classroom student reads: a teacher sees only their own classes', () => {
  it('lists the students of the classes the actor owns, and no others', async () => {
    const a = await call('GET', '/api/students', tokens.teacherA);
    expect(a.status).toBe(200);
    // Class 12's student 112 belongs to teacher B, and must not appear.
    expect(studentIds(a.body)).toEqual([110, 111]);

    const b = await call('GET', '/api/students', tokens.teacherB);
    expect(b.status).toBe(200);
    expect(studentIds(b.body)).toEqual([112]);
  });

  it('honours an owned classId filter and refuses a class the teacher does not own', async () => {
    const owned = await call('GET', '/api/students?classId=11', tokens.teacherA);
    expect(owned.status).toBe(200);
    expect(studentIds(owned.body)).toEqual([110, 111]);

    const foreign = await call('GET', '/api/students?classId=12', tokens.teacherA);
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ success: false, message: '无权限查看该班级' });
  });

  it('reads a student of their own class and refuses a student of another class', async () => {
    const own = await call('GET', '/api/students/110', tokens.teacherA);
    expect(own.status).toBe(200);
    expect(own.body.student.name).toBe('小明');

    const foreign = await call('GET', '/api/students/112', tokens.teacherA);
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ success: false, message: '无权限查看该学生' });

    // ...and the other teacher's view is the mirror image, so neither can read the other's.
    const mirrored = await call('GET', '/api/students/112', tokens.teacherB);
    expect(mirrored.status).toBe(200);
    expect(mirrored.body.student.name).toBe('小刚');
  });

  it('scopes the ledger to the teacher own students, and lets no query widen it', async () => {
    const own = await call('GET', '/api/students/records', tokens.teacherA);
    expect(own.status).toBe(200);
    expect(ledgerRows(own.body)).toEqual([
      [110, 5, '一班小明'],
      [111, 5, '一班小红'],
    ]);

    // The legacy `teacherId` branch used to let the query pick whose records to read; the
    // actor now decides, so asking for the other teacher's scope still answers only our own.
    const widened = await call('GET', '/api/students/records?teacherId=109', tokens.teacherA);
    expect(widened.status).toBe(200);
    expect(ledgerRows(widened.body)).toEqual([
      [110, 5, '一班小明'],
      [111, 5, '一班小红'],
    ]);

    const perStudent = await call('GET', '/api/students/records?studentId=110', tokens.teacherA);
    expect(perStudent.status).toBe(200);
    expect(ledgerRows(perStudent.body)).toEqual([[110, 5, '一班小明']]);

    const foreign = await call('GET', '/api/students/records?studentId=112', tokens.teacherA);
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ success: false, message: '无权限查看该学生的积分记录' });
  });

  it('scopes the progress-star board to the teacher own classes', async () => {
    const a = await call('GET', '/api/students/progress-star', tokens.teacherA);
    expect(a.status).toBe(200);
    expect(studentIds(a.body)).toEqual([110, 111]);

    const b = await call('GET', '/api/students/progress-star', tokens.teacherB);
    expect(studentIds(b.body)).toEqual([112]);
  });

  it('scopes the class routes to the teacher own classes', async () => {
    expect((await call('GET', '/api/classes/11', tokens.teacherA)).status).toBe(200);
    expect((await call('GET', '/api/classes/12', tokens.teacherA)).status).toBe(403);
    expect((await call('GET', '/api/classes/11/features', tokens.teacherA)).status).toBe(200);
    expect((await call('GET', '/api/classes/12/features', tokens.teacherA)).status).toBe(403);
    expect((await call('GET', '/api/classes/11/bigscreen', tokens.teacherA)).status).toBe(200);
    expect((await call('GET', '/api/classes/12/bigscreen', tokens.teacherA)).status).toBe(403);
    expect((await call('GET', '/api/classes/11/guild-ranking', tokens.teacherA)).status).toBe(200);
    expect((await call('GET', '/api/classes/12/guild-ranking', tokens.teacherA)).status).toBe(403);
  });

  it('scopes attendance and leaves to the teacher own classes', async () => {
    const attendance = await call('GET', '/api/attendance?class_id=11', tokens.teacherA);
    expect(attendance.status).toBe(200);
    expect((attendance.body.data ?? []).map((row: any) => row.student_id).sort()).toEqual([110, 111]);

    expect((await call('GET', '/api/attendance?class_id=12', tokens.teacherA)).status).toBe(403);

    const allAttendance = await call('GET', '/api/attendance', tokens.teacherA);
    expect(rowStudentIds(allAttendance.body).sort()).toEqual([110, 111]);

    const leaves = await call('GET', '/api/leaves', tokens.teacherA);
    expect(leaves.status).toBe(200);
    expect(rowStudentIds(leaves.body)).toEqual([110]);
  });

  it('scopes the presets list to the teacher own presets', async () => {
    const presets = await call('GET', '/api/presets', tokens.teacherA);
    expect(presets.status).toBe(200);
    expect((presets.body.presets ?? []).map((preset: any) => preset.id)).toEqual([4000]);

    const widened = await call('GET', '/api/presets?teacherId=109', tokens.teacherA);
    expect(widened.status).toBe(200);
    expect((widened.body.presets ?? []).map((preset: any) => preset.id)).toEqual([4000]);
  });
});

describe('classroom student reads: a student sees only themselves', () => {
  it('lists exactly their own row', async () => {
    const { status, body } = await call('GET', '/api/students', tokens.student);
    expect(status).toBe(200);
    expect(studentIds(body)).toEqual([110]);
  });

  it('reads their own student and refuses a classmate', async () => {
    const own = await call('GET', '/api/students/110', tokens.student);
    expect(own.status).toBe(200);
    expect(own.body.student.name).toBe('小明');

    const classmate = await call('GET', '/api/students/111', tokens.student);
    expect(classmate.status).toBe(403);
    expect(classmate.body).toEqual({ success: false, message: '无权限查看该学生' });
  });

  it('reads only their own ledger, whatever studentId the query asks for', async () => {
    const own = await call('GET', '/api/students/records', tokens.student);
    expect(own.status).toBe(200);
    expect(ledgerRows(own.body)).toEqual([[110, 5, '一班小明']]);

    const ownFiltered = await call('GET', '/api/students/records?studentId=110', tokens.student);
    expect(ownFiltered.status).toBe(200);
    expect(ledgerRows(ownFiltered.body)).toEqual([[110, 5, '一班小明']]);

    const classmate = await call('GET', '/api/students/records?studentId=111', tokens.student);
    expect(classmate.status).toBe(403);
  });

  it('reads their own attendance and leaves, and their own class features', async () => {
    expect(rowStudentIds((await call('GET', '/api/attendance', tokens.student)).body)).toEqual([110]);
    expect(rowStudentIds((await call('GET', '/api/leaves', tokens.student)).body)).toEqual([110]);

    expect((await call('GET', '/api/classes/11/features', tokens.student)).status).toBe(200);
    expect((await call('GET', '/api/classes/12/features', tokens.student)).status).toBe(403);
    expect((await call('GET', '/api/classes/11/guild-ranking', tokens.student)).status).toBe(200);
    expect((await call('GET', '/api/classes/12/guild-ranking', tokens.student)).status).toBe(403);
    expect((await call('GET', '/api/classes/12/bigscreen', tokens.student)).status).toBe(403);
  });
});

describe('classroom student reads: a parent sees only their linked children', () => {
  it('lists exactly the linked children', async () => {
    const { status, body } = await call('GET', '/api/students', tokens.parent);
    expect(status).toBe(200);
    expect(studentIds(body)).toEqual([110]);
  });

  it('reads a linked child and refuses an unlinked student', async () => {
    const child = await call('GET', '/api/students/110', tokens.parent);
    expect(child.status).toBe(200);
    expect(child.body.student.name).toBe('小明');

    const stranger = await call('GET', '/api/students/111', tokens.parent);
    expect(stranger.status).toBe(403);
    expect(stranger.body).toEqual({ success: false, message: '无权限查看该学生' });
  });

  it('reads only the linked children ledger', async () => {
    // The parent dashboard filters by `?studentId=`; a child that is not theirs is refused.
    const child = await call('GET', '/api/students/records?studentId=110', tokens.parent);
    expect(child.status).toBe(200);
    expect(ledgerRows(child.body)).toEqual([[110, 5, '一班小明']]);

    const all = await call('GET', '/api/students/records', tokens.parent);
    expect(all.status).toBe(200);
    expect(ledgerRows(all.body)).toEqual([[110, 5, '一班小明']]);

    const stranger = await call('GET', '/api/students/records?studentId=111', tokens.parent);
    expect(stranger.status).toBe(403);
    expect(stranger.body).toEqual({ success: false, message: '无权限查看该学生的积分记录' });
  });

  it('reads only the linked children attendance and leaves', async () => {
    expect(rowStudentIds((await call('GET', '/api/attendance', tokens.parent)).body)).toEqual([110]);
    expect(rowStudentIds((await call('GET', '/api/leaves', tokens.parent)).body)).toEqual([110]);
  });
});

describe('classroom student reads: the admin console keeps the full view', () => {
  it('lists every student and reads any student', async () => {
    const roster = await call('GET', '/api/students', tokens.admin);
    expect(roster.status).toBe(200);
    expect(studentIds(roster.body)).toEqual([110, 111, 112]);

    const student = await call('GET', '/api/students/112', tokens.admin);
    expect(student.status).toBe(200);
    expect(student.body.student.name).toBe('小刚');
  });

  it('reads the whole ledger and still honours the legacy filters', async () => {
    const all = await call('GET', '/api/students/records', tokens.admin);
    expect(all.status).toBe(200);
    expect(ledgerRows(all.body)).toEqual([
      [110, 5, '一班小明'],
      [111, 5, '一班小红'],
      [112, 5, '二班小刚'],
    ]);

    const byStudent = await call('GET', '/api/students/records?studentId=112', tokens.admin);
    expect(ledgerRows(byStudent.body)).toEqual([[112, 5, '二班小刚']]);
  });
});

describe('classroom invite lookup stays public', () => {
  it.each(['/api/classes/invite/ABC123', '/api/class/invite/ABC123'])(
    '%s answers an anonymous caller with the class it names',
    async (endpoint) => {
      // The activation page calls this before login (`src/features/auth/api/authApi.ts:30`):
      // a 401 here would break account activation, so it must stay anonymous.
      const { status, body } = await call('GET', endpoint);

      expect(status, `${endpoint} must stay public`).toBe(200);
      expect(body.success).toBe(true);
      expect(body.class).toMatchObject({ id: 11, name: '一班' });
      // The unbound student 113 is exactly what the activation flow needs to see.
      expect(body.students).toEqual([{ id: 113, name: '还没登录的学生' }]);
    },
  );
});

describe('classroom student reads: the response envelopes are unchanged', () => {
  it.each([
    ['/api/students', 'students'],
    ['/api/students/110', 'student'],
    ['/api/students/records', 'records'],
  ])('GET %s still answers { success, %s }', async (endpoint, key) => {
    const { status, body } = await call('GET', endpoint, tokens.teacherA);

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([key, 'success']);
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Writes: every mutating route, anonymous and cross-scope
// ---------------------------------------------------------------------------

describe('classroom writes: anonymous callers are refused before validation', () => {
  it.each([
    ['POST', '/api/students/checkin'],
    ['POST', '/api/students/gift'],
    ['POST', '/api/students/batch-import'],
    ['POST', '/api/students'],
    ['POST', '/api/students/batch-points'],
    ['POST', '/api/students/batch-edit'],
    ['POST', '/api/students/110/points'],
    ['PUT', '/api/students/110/birthday'],
    ['GET', '/api/students/110/achievements'],
    ['GET', '/api/students/110/peer-reviews/pending'],
    ['POST', '/api/students/110/peer-reviews'],
    ['PUT', '/api/classes/11/settings'],
    ['PUT', '/api/classes/11/features'],
    ['POST', '/api/presets'],
    ['DELETE', '/api/presets/4000'],
    ['POST', '/api/attendance'],
    ['POST', '/api/leaves'],
    ['PUT', '/api/leaves/3000'],
  ])('%s %s answers 401 and changes nothing', async (method, endpoint) => {
    const { status, body } = await call(method, endpoint);

    expect(status, `${method} ${endpoint} must refuse an anonymous caller`).toBe(401);
    expect(body).toEqual(ANONYMOUS);
  });

  it('left the database untouched: the seeded preset and student are still there', async () => {
    const preset = kernel.db.prepare(`SELECT id FROM point_presets WHERE id = 4000`).get();
    expect(preset).toBeTruthy();
    const student = kernel.db.prepare(`SELECT class_id FROM students WHERE id = 110`).get() as { class_id: number };
    expect(student.class_id).toBe(11);
  });
});

describe('classroom writes: teacher scope', () => {
  it('flips feature flags only on the teacher own class', async () => {
    // Enabling the two features the student section then exercises is itself part of the test.
    const own = await call('PUT', '/api/classes/11/settings', tokens.teacherA, {
      enable_shop: false,
      enable_achievements: true,
      enable_peer_review: true,
    });
    expect(own.status).toBe(200);

    const foreign = await call('PUT', '/api/classes/12/settings', tokens.teacherA, { enable_shop: false });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ success: false, message: '无权限修改该班级设置' });
    expect((await call('PUT', '/api/classes/12/features', tokens.teacherA, { enable_shop: false })).status).toBe(403);
  });

  it('adds and subtracts points only for students of the teacher own classes', async () => {
    expect((await call('POST', '/api/students/110/points', tokens.teacherA, { amount: 3, reason: '一班加分' })).status).toBe(200);

    const foreign = await call('POST', '/api/students/112/points', tokens.teacherA, { amount: 3, reason: '越权加分' });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ success: false, message: '无权限修改该学生的积分' });

    expect(
      (await call('POST', '/api/students/batch-points', tokens.teacherA, { studentIds: [110, 111], amount: 1, reason: '批量' }))
        .status,
    ).toBe(200);
    // One foreign id refuses the whole batch rather than scoring the subset that is theirs.
    expect(
      (await call('POST', '/api/students/batch-points', tokens.teacherA, { studentIds: [110, 112], amount: 1, reason: '批量' }))
        .status,
    ).toBe(403);
  });

  it('refuses the batch-edit account takeover on a foreign student', async () => {
    // The migration matrix's P0: `action: 'reset_password'` used to bypass the ownership check
    // `PUT /api/students/:id/password` has.
    const takeover = await call('POST', '/api/students/batch-edit', tokens.teacherA, {
      studentIds: [112],
      action: 'reset_password',
      value: 'pwned',
    });
    expect(takeover.status).toBe(403);

    expect(
      (
        await call('POST', '/api/students/batch-edit', tokens.teacherA, {
          studentIds: [110],
          action: 'reset_password',
          value: 'fresh-secret',
        })
      ).status,
    ).toBe(200);
    // Moving a student into a class the teacher does not own is refused as well.
    expect(
      (
        await call('POST', '/api/students/batch-edit', tokens.teacherA, {
          studentIds: [110],
          action: 'change_class',
          value: 12,
        })
      ).status,
    ).toBe(403);
  });

  it('writes a birthday and reads achievements only for the teacher own students', async () => {
    expect((await call('PUT', '/api/students/110/birthday', tokens.teacherA, { birthday: '2013-01-01' })).status).toBe(200);
    expect((await call('PUT', '/api/students/112/birthday', tokens.teacherA, { birthday: '2013-01-01' })).status).toBe(403);

    expect((await call('GET', '/api/students/110/achievements', tokens.teacherA)).status).toBe(200);
    expect((await call('GET', '/api/students/112/achievements', tokens.teacherA)).status).toBe(403);
  });

  it('does not let a teacher act as a student (peer review, check-in, gift)', async () => {
    expect((await call('GET', '/api/students/110/peer-reviews/pending', tokens.teacherA)).status).toBe(403);
    expect(
      (await call('POST', '/api/students/110/peer-reviews', tokens.teacherA, { reviewee_id: 111, score: 5 })).status,
    ).toBe(403);
    expect((await call('POST', '/api/students/checkin', tokens.teacherA, { studentId: 110 })).status).toBe(403);
    expect((await call('POST', '/api/leaves', tokens.teacherA, { student_id: 110 })).status).toBe(403);
  });

  it('creates students in the teacher own class, never the database first class', async () => {
    const imported = await call('POST', '/api/students/batch-import', tokens.teacherA, {
      students: [{ username: 'imported11', name: '导入生' }],
    });
    expect(imported.status).toBe(200);
    expect(imported.body.students[0].class_id).toBe(11);

    expect(
      (
        await call('POST', '/api/students/batch-import', tokens.teacherA, {
          students: [{ username: 'imported12', name: '导入生' }],
          class_id: 12,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call('POST', '/api/students', tokens.teacherA, { username: 'created11', name: '新生', class_id: 11 })).status,
    ).toBe(200);
    expect(
      (await call('POST', '/api/students', tokens.teacherA, { username: 'created12', name: '新生', class_id: 12 })).status,
    ).toBe(403);
  });

  it('owns their presets: the owner is the actor, and a foreign preset cannot be deleted', async () => {
    const created = await call('POST', '/api/presets', tokens.teacherA, { label: '一班预设', amount: 2, teacher_id: 109 });
    expect(created.status).toBe(200);
    expect(created.body.preset.teacher_id).toBe(107);

    expect((await call('DELETE', '/api/presets/4001', tokens.teacherA)).status).toBe(403);
    expect((await call('DELETE', '/api/presets/4000', tokens.teacherA)).status).toBe(200);
  });

  it('writes attendance and approves leaves only for the teacher own classes', async () => {
    expect(
      (
        await call('POST', '/api/attendance', tokens.teacherA, {
          class_id: 11,
          records: [{ student_id: 110, date: '2026-01-08', status: 'present' }],
        })
      ).status,
    ).toBe(200);
    expect((await call('POST', '/api/attendance', tokens.teacherA, { class_id: 12, records: [] })).status).toBe(403);

    expect((await call('PUT', '/api/leaves/3000', tokens.teacherA, { status: 'approved', review_comment: 'ok' })).status).toBe(200);
    expect((await call('PUT', '/api/leaves/3001', tokens.teacherA, { status: 'approved' })).status).toBe(403);
  });
});

describe('classroom writes: student scope', () => {
  it('checks in and gifts only from their own account', async () => {
    expect((await call('POST', '/api/students/checkin', tokens.student, { studentId: 110 })).status).toBe(200);
    expect((await call('POST', '/api/students/checkin', tokens.student, { studentId: 111 })).status).toBe(403);

    expect(
      (await call('POST', '/api/students/gift', tokens.student, { senderId: 110, receiverId: 111, points: 1, message: 'hi' }))
        .status,
    ).toBe(200);
    expect(
      (await call('POST', '/api/students/gift', tokens.student, { senderId: 111, receiverId: 110, points: 1, message: 'hi' }))
        .status,
    ).toBe(403);
    // A gift to another class is refused: the receiver must share the sender's class.
    expect(
      (await call('POST', '/api/students/gift', tokens.student, { senderId: 110, receiverId: 112, points: 1, message: 'hi' }))
        .status,
    ).toBe(403);
  });

  it('submits peer reviews only in their own name', async () => {
    const queue = await call('GET', '/api/students/110/peer-reviews/pending', tokens.student);
    expect(queue.status).toBe(200);
    const pendingIds = (queue.body.pending ?? []).map((peer: any) => peer.id);
    expect(pendingIds).toContain(111);
    // Class 12's student 112 is not a classmate and must not be listed.
    expect(pendingIds).not.toContain(112);

    expect((await call('GET', '/api/students/111/peer-reviews/pending', tokens.student)).status).toBe(403);
    expect(
      (await call('POST', '/api/students/111/peer-reviews', tokens.student, { reviewee_id: 110, score: 5, is_anonymous: false }))
        .status,
    ).toBe(403);

    // The reviewer's own account is allowed through. The legacy write behind the route then
    // fails with 500 because `messages` has no `student_id` / `sender_name` column - a
    // pre-existing defect unrelated to authorization (it fails for anonymous callers too, once
    // they pass the old no-op check). Only the authorization half is asserted here.
    const own = await call('POST', '/api/students/110/peer-reviews', tokens.student, {
      reviewee_id: 111,
      score: 5,
      comment: 'good',
      is_anonymous: false,
    });
    expect([401, 403]).not.toContain(own.status);
  });
});

describe('classroom writes: parent scope', () => {
  it('only awards an approved family task for their own child', async () => {
    expect((await call('POST', '/api/students/110/points', tokens.parent, { amount: 2, reason: '家庭任务奖励' })).status).toBe(403);

    const stranger = await call('POST', '/api/students/111/points', tokens.parent, { amount: 2, reason: '越权' });
    expect(stranger.status).toBe(403);
    expect(stranger.body).toEqual({ success: false, message: '无权限修改该学生的积分' });

    expect((await call('POST', '/api/students/checkin', tokens.parent, { studentId: 110 })).status).toBe(403);
  });

  it('files leave only for their own child, with themselves as the parent', async () => {
    const created = await call('POST', '/api/leaves', tokens.parent, {
      student_id: 110,
      parent_id: 999,
      start_date: '2026-01-10',
      end_date: '2026-01-11',
      reason: '事假',
    });
    expect(created.status).toBe(200);

    const row = kernel.db.prepare(`SELECT parent_id FROM leave_requests WHERE id = ?`).get(created.body.id) as {
      parent_id: number;
    };
    expect(row.parent_id).toBe(130);

    expect(
      (
        await call('POST', '/api/leaves', tokens.parent, {
          student_id: 111,
          start_date: '2026-01-10',
          end_date: '2026-01-11',
          reason: 'x',
        })
      ).status,
    ).toBe(403);
  });
});

describe('classroom writes: the admin console keeps the full surface', () => {
  it('reads and changes any class, preset, attendance row and leave', async () => {
    expect((await call('GET', '/api/classes/12', tokens.admin)).status).toBe(200);
    expect((await call('PUT', '/api/classes/12/settings', tokens.admin, { enable_shop: true })).status).toBe(200);
    expect((await call('GET', '/api/classes/12/bigscreen', tokens.admin)).status).toBe(200);
    expect((await call('GET', '/api/presets?teacherId=109', tokens.admin)).status).toBe(200);
    expect((await call('GET', '/api/attendance', tokens.admin)).status).toBe(200);
    expect((await call('GET', '/api/leaves', tokens.admin)).status).toBe(200);
    expect((await call('PUT', '/api/leaves/3001', tokens.admin, { status: 'rejected' })).status).toBe(200);
  });
});

describe('incentive policy and transactional scoring', () => {
  beforeAll(() => {
    kernel.db.exec(`
      INSERT INTO users (id, role, username, password_hash) VALUES (210, 'student', 'score210', 'x'), (211, 'student', 'score211', 'x');
      INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (13, '三班', 107, 'DEF456');
      INSERT INTO student_groups (id, name, class_id) VALUES (501, '原小组', 11), (502, '目标小组', 13);
      INSERT INTO students (id, user_id, class_id, group_id, name, total_points, available_points) VALUES
        (210, 210, 11, 501, '评分学生甲', 0, 0), (211, 211, 11, 501, '评分学生乙', 0, 0);
    `);
  });

  beforeEach(() => {
    kernel.db.exec(`DELETE FROM p_classroom_point_events WHERE student_id IN (210,211);
      DELETE FROM records WHERE student_id IN (210,211);
      UPDATE students SET class_id = 11, group_id = 501, total_points = 0, available_points = 0, last_checkin_date = NULL WHERE id IN (210,211);
      DELETE FROM parent_activity WHERE student_id = 210;
      DELETE FROM p_classroom_incentive_policies WHERE class_id IN (11,13);`);
  });

  it('enforces integer range and daily positive cap using server results', async () => {
    expect((await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 1.5 })).status).toBe(400);
    expect((await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 6 })).status).toBe(400);
    for (let index = 0; index < 4; index += 1) {
      expect((await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 5, reason: '课堂表现', requestId: `cap-${index}` })).status).toBe(200);
    }
    const capped = await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 1, reason: '课堂表现', requestId: 'cap-extra' });
    expect(capped.status).toBe(400);
    const row = kernel.db.prepare('SELECT total_points, available_points FROM students WHERE id = 210').get() as { total_points: number; available_points: number };
    expect(row).toEqual({ total_points: 20, available_points: 20 });
  });

  it('replays a request without adding points twice', async () => {
    const payload = { amount: 5, reason: '课堂表现', requestId: 'repeat-score' };
    const first = await call('POST', '/api/students/210/points', tokens.teacherA, payload);
    const second = await call('POST', '/api/students/210/points', tokens.teacherA, payload);
    expect(first.status).toBe(200);
    expect(second.body.student).toMatchObject({ applied: 5, replayed: true, total_points: 5, available_points: 5 });
    expect((kernel.db.prepare("SELECT COUNT(*) AS n FROM p_classroom_point_events WHERE student_id = 210").get() as { n: number }).n).toBe(1);
    expect((await call('POST', '/api/students/210/points', tokens.teacherA, { ...payload, amount: 4 })).status).toBe(409);
  });

  it('caps the parent blessing at two additional credits per day', async () => {
    expect((await call('PUT', '/api/classes/11/incentive-policy', tokens.teacherB, { parentBonusPercent: 20 })).status).toBe(403);
    expect((await call('PUT', '/api/classes/11/incentive-policy', tokens.teacherA, { parentBonusPercent: 7 })).status).toBe(400);
    expect((await call('PUT', '/api/classes/11/incentive-policy', tokens.teacherA, { parentBonusPercent: 20, schoolStage: 'middle' })).status).toBe(200);
    expect((await call('PUT', '/api/classes/11/settings', tokens.teacherA, { enable_parent_buff: true })).status).toBe(200);
    kernel.db.exec("INSERT INTO parent_activity (parent_id, student_id, activity_type) VALUES (130, 210, 'PARENT_BUFF')");
    const first = await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 5, reason: '鼓励' });
    const second = await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 5, reason: '鼓励' });
    const third = await call('POST', '/api/students/210/points', tokens.teacherA, { amount: 5, reason: '鼓励' });
    expect(first.body.student.bonus).toBe(1);
    expect(second.body.student.bonus).toBe(1);
    expect(third.body.student.bonus).toBe(0);
    expect(third.body.student.available_points).toBe(17);
    const summary = await call('GET', '/api/students/210/summary', tokens.teacherA);
    expect(summary.body.summary).toMatchObject({ growth: 15, availableCredits: 17, schoolStage: 'middle' });
    expect((await call('GET', '/api/students/210/summary', tokens.teacherB)).status).toBe(403);
  });

  it('rolls back a batch if one student cannot be debited', async () => {
    kernel.db.exec('UPDATE students SET available_points = 5 WHERE id = 210');
    const response = await call('POST', '/api/students/batch-points', tokens.teacherA, { studentIds: [210, 211], amount: -3, reason: '调整', requestId: 'batch-rollback' });
    expect(response.status).toBe(400);
    const rows = kernel.db.prepare('SELECT id, available_points FROM students WHERE id IN (210,211) ORDER BY id').all();
    expect(rows).toEqual([{ id: 210, available_points: 5 }, { id: 211, available_points: 0 }]);
    expect((kernel.db.prepare("SELECT COUNT(*) AS n FROM p_classroom_point_events WHERE request_id = 'batch-rollback'").get() as { n: number }).n).toBe(0);
  });

  it('validates target groups and clears the old group on a class move', async () => {
    expect((await call('POST', '/api/students/batch-edit', tokens.teacherA, { studentIds: [210], action: 'change_group', value: 502 })).status).toBe(400);
    expect((await call('POST', '/api/students/batch-edit', tokens.teacherA, { studentIds: [210], action: 'change_class', value: 13 })).status).toBe(200);
    expect(kernel.db.prepare('SELECT class_id, group_id FROM students WHERE id = 210').get()).toEqual({ class_id: 13, group_id: null });
  });

  it('uses the Shanghai Monday window and divides team scores by current members', async () => {
    kernel.db.exec(`
      INSERT INTO p_classroom_point_events (student_id, source, category, growth_delta, credits_delta, created_at)
        VALUES (210, 'team_quest_reward', 'collaboration', 8, 8,
          datetime(date('now', '+8 hours', 'weekday 0', '-6 days'), '-8 hours', '+1 hour'));
      INSERT INTO p_classroom_point_events (student_id, source, category, growth_delta, credits_delta, created_at)
        VALUES (210, 'team_quest_reward', 'collaboration', 100, 100,
          datetime(date('now', '+8 hours', 'weekday 0', '-6 days'), '-8 hours', '-1 day'));
    `);
    const response = await call('GET', '/api/classes/11/team-ranking?category=collaboration', tokens.teacherA);
    expect(response.status).toBe(200);
    expect(response.body.rankings).toMatchObject([{ group_id: 501, members: 2, score: 4 }]);
  });

  it('counts one daily check-in as growth and participation without spendable credits', async () => {
    const studentToken = kernel.sessions.issue({ userId: 210, role: 'student', ttlMs: 60_000 }).token;
    const first = await call('POST', '/api/students/checkin', studentToken, { studentId: 210 });
    expect(first.status).toBe(200);
    const summary = await call('GET', '/api/students/210/summary', studentToken);
    expect(summary.body.summary).toMatchObject({ growth: 1, participation: 1, availableCredits: 0 });
    expect((await call('POST', '/api/students/checkin', studentToken, { studentId: 210 })).status).toBe(400);
  });
});
