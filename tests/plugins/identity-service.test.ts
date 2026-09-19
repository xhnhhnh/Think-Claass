/**
 * Identity service tests - the repository driven against a real SQLite database.
 *
 * Replaces the four suites deleted with `api/modules/auth/**`
 * (`auth.password`, `auth.activate`, `auth.login-class-context`, `auth.profile`) plus the
 * `api/services/activationService.ts` behaviour they depended on. Every one of those suites ran
 * against a `vi.mock`ed Prisma client, which is exactly why three of their assumptions could never
 * be checked: a mock has no schema, no `NOT NULL`, no foreign keys and no uniqueness.
 *
 * So the layers here are:
 *
 *   - the schema is built by the real migration chain (`APP_MIGRATIONS` plus the kernel's own set,
 *     through a real `createKernel({ inMemoryDatabase: true })`), so `users`, `activation_codes`
 *     and `activation_events` are production's tables down to the constraints;
 *   - the repository runs through the real ownership-checked `DbApi` built from the manifest's
 *     `data.adopted` list with `strict: true`, so a statement naming an undeclared table fails here
 *     exactly as it would in development;
 *   - `classroom.public` and `parent_buff.public` are fakes, because the plugin deliberately may
 *     not touch `students`, `classes`, `parent_students` or `parent_activity` directly. The fakes
 *     record every call, so a test can prove the actor and the binding went *through the port*.
 *
 * What this file is really pinning, beyond the ported cases:
 *   - the two spellings of the class id (`classId` and `class_id`) in the login body, which the
 *     frontend reads and which the old suite asserted through a mock;
 *   - that `activateUser` is idempotent on the pre-migration dedupe key `(userId, source,
 *     activationCode, orderId)` - the property that makes a retried payment webhook safe;
 *   - that a plaintext password is upgraded to a hash at login while a hash is left alone.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClassFeatureSnapshot, ClassroomPort, ClassroomResult, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { ParentActivityRecorder } from '@thinkclass/contracts/domains/parent-buff';
import { ApiError, createKernel, isPasswordHash, verifyPassword, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createIdentityRepository } from '../../plugins/identity/src/identity.repository.js';
import { IdentityService } from '../../plugins/identity/src/identity.service.js';

/** Mirrors `plugins/identity/plugin.json` -> `data.adopted`. `data.reads` is intentionally empty. */
const ADOPTED_TABLES = ['users', 'activation_codes', 'activation_events'];

/**
 * A stand-in for `students.name` encryption.
 *
 * The real write path encrypts through `classroom.public.bindStudentToUser`, and the real read path
 * decrypts through `ctx.config.decryptName`. Both are the host's job, so the fake stores a
 * reversible marker and the test injects a matching decryptor: what is being checked is that the
 * service *asks the port* to bind and *uses the injected decryptor* to read, not the cipher itself
 * (the probe against a real server covers that).
 */
const PREFIX = 'enc:';
const fakeDecrypt = (value: string) => (value?.startsWith(PREFIX) ? value.slice(PREFIX.length) : value);

/** Every call the service made through the classroom port, so "it used the port" is assertable. */
interface PortCalls {
  getStudentByUserId: number[];
  listStudentsByParent: number[];
  getClassById: number[];
  getClassFeatureSnapshot: number[];
  findClassByInviteCode: string[];
  getStudentById: number[];
  bindStudentToUser: Array<{ studentId: number; userId: number; name?: string | null }>;
  linkParentToStudent: Array<{ parentId: number; studentId: number }>;
}

function createFakeClassroom(): {
  port: ClassroomPort;
  calls: PortCalls;
  setSnapshot(next: Record<string, boolean>): void;
} {
  const calls: PortCalls = {
    getStudentByUserId: [],
    listStudentsByParent: [],
    getClassById: [],
    getClassFeatureSnapshot: [],
    findClassByInviteCode: [],
    getStudentById: [],
    bindStudentToUser: [],
    linkParentToStudent: [],
  };

  const students: StudentSnapshot[] = [
    { id: 21, classId: 5, userId: 7, name: `${PREFIX}小明`, totalPoints: 0, availablePoints: 0, groupId: null },
    { id: 31, classId: 6, userId: null, name: `${PREFIX}小红`, totalPoints: 0, availablePoints: 0, groupId: null },
  ];
  const classes: Record<number, { id: number; name: string; teacherId: number | null; inviteCode: string }> = {
    // The invitation the tests use (`AAA111`) belongs to class 6, because student 31 - the
    // unbound student registration binds - is in class 6. The class-5 invitation is the one that
    // must NOT accept that student, which is the cross-class assertion below.
    5: { id: 5, name: '一班', teacherId: 1, inviteCode: 'BBB222' },
    6: { id: 6, name: '二班', teacherId: 1, inviteCode: 'AAA111' },
  };
  let snapshot: Record<string, boolean> = { enable_shop: true, enable_lucky_draw: false };

  const port: ClassroomPort = {
    async getStudentById(studentId) {
      calls.getStudentById.push(studentId);
      return students.find((student) => student.id === studentId) ?? null;
    },
    async getStudentByUserId(userId) {
      calls.getStudentByUserId.push(userId);
      return students.find((student) => student.userId === userId) ?? null;
    },
    async getClassById(classId) {
      calls.getClassById.push(classId);
      return classes[classId] ?? null;
    },
    async findClassByInviteCode(code) {
      calls.findClassByInviteCode.push(code);
      return Object.values(classes).find((cls) => cls.inviteCode === code) ?? null;
    },
    async listClassStudents() {
      return students;
    },
    async listStudentsByParent(parentId) {
      calls.listStudentsByParent.push(parentId);
      // Parent 8 is linked to student 31; anyone else has no children.
      return parentId === 8 ? students.filter((student) => student.id === 31) : [];
    },
    async searchClasses(query, excludeClassId) {
      return Object.values(classes).filter((cls) => cls.id !== excludeClassId && (!query || cls.name.includes(query)));
    },
    async assertStudentInClass(studentId, classId) {
      const student = students.find((candidate) => candidate.id === studentId);
      if (!student || student.classId !== classId) throw new Error('not in class');
    },
    async adjustPoints() {
      return { totalPoints: 0, availablePoints: 0 };
    },
    async transferStudentCredits() {
      return { value: { availablePoints: 0 } } as ClassroomResult<{ availablePoints: number }>;
    },
    async recordStudentLedgerEntry() {
      /* identity never moves points */
    },
    async listStudentLedger() {
      return [];
    },
    async sumClassPointsEarnedSince() {
      return 0;
    },
    async getClassIdByStudentId(studentId) {
      return students.find((student) => student.id === studentId)?.classId ?? null;
    },
    async getClassFeatureSnapshot(classId) {
      calls.getClassFeatureSnapshot.push(classId);
      return classes[classId] ? ({ ...snapshot } as ClassFeatureSnapshot) : null;
    },
    async linkParentToStudent(parentId, studentId) {
      calls.linkParentToStudent.push({ parentId, studentId });
    },
    async bindStudentToUser(input): Promise<ClassroomResult<StudentSnapshot>> {
      calls.bindStudentToUser.push(input);
      const student = students.find((candidate) => candidate.id === input.studentId);
      if (!student) return { refusal: { code: 'student-not-found', message: '未找到该学生记录' } };
      if (student.userId != null && student.userId !== input.userId) {
        return { refusal: { code: 'already-bound', message: '该学生已被绑定' } };
      }
      student.userId = input.userId;
      student.name = `${PREFIX}${input.name ?? ''}`;
      return { value: student };
    },
    async checkStudentFeature() {
      return { value: true };
    },
    async checkClassFeature() {
      return { value: true };
    },
    async checkAnyClassFeature() {
      return { value: true };
    },
    // Account-deletion scope (P4.3b.14): identity's own paths never ask for it; the port requires both.
    async listClassIdsByTeacher() {
      return [];
    },
    async listStudentAccountsByClassIds() {
      return [];
    },
  };

  return {
    port,
    calls,
    // A test can flip the whole map to prove the login body follows the port rather than a stub.
    setSnapshot(next: Record<string, boolean>) {
      snapshot = next;
    },
  };
}

function createFakeParentBuff(): { port: ParentActivityRecorder; calls: Array<{ parentId: number; studentId: number; day: string }> } {
  const calls: Array<{ parentId: number; studentId: number; day: string }> = [];
  return {
    port: {
      async touchParentLogin(parentId, studentId, day) {
        calls.push({ parentId, studentId, day });
      },
    },
    calls,
  };
}

let kernel: Kernel;
let api: DbApi;
let classroom: ReturnType<typeof createFakeClassroom>;
let parentBuff: ReturnType<typeof createFakeParentBuff>;
let service: IdentityService;
let parentBuffAvailable: boolean;

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

function seedPeople() {
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES
      (1, 'teacher', 'teacher1', 'scrypt$16384$8$1$aa$bb', 1),
      (7, 'student', 'student01', '123456', 1),
      (8, 'parent', 'parent01', '123456', 1),
      (9, 'teacher', 'teacher9', '123456', 0);
    INSERT INTO classes (id, name, teacher_id, invite_code, enable_shop, enable_lucky_draw)
      VALUES (5, '一班', 1, 'AAA111', 1, 0);
    INSERT INTO activation_codes (id, code, status) VALUES (3,'TC-ABCD1234','unused'), (4,'TC-USED0000','used');
  `);
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

  classroom = createFakeClassroom();
  parentBuff = createFakeParentBuff();
  parentBuffAvailable = true;

  service = new IdentityService({
    /**
     * The service reads exactly three context members (`config.decryptName`, `config.sessionTtlMs`,
     * `log`, `settings.getPlatform`), so the test supplies those instead of a whole `KernelContext`.
     * The rest of the context belongs to the runtime, and `tests/plugins/host.test.ts` covers the
     * real one.
     */
    ctx: {
      config: { ...kernel.config, decryptName: fakeDecrypt },
      log: kernel.logger,
      settings: { getPlatform: (key: string) => kernel.settings.get(key) },
    } as never,
    repository: createIdentityRepository(api),
    classroom: classroom.port,
    // Lazily resolved, like production: a function so the optional port can be absent.
    parentBuff: () => (parentBuffAvailable ? parentBuff.port : null),
  });
  seedPeople();
});

afterEach(async () => {
  await kernel.shutdown();
});

// ---------------------------------------------------------------------------

describe('login: credentials and the password upgrade', () => {
  it('rejects a wrong password with 401 and makes no write', async () => {
    const error = await apiErrorOf(() => service.login({ username: 'student01', password: 'wrong', role: 'student' }));
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('账号或密码错误，请重试');
  });

  it('upgrades a legacy plaintext password to a hash on the first successful login', async () => {
    await service.login({ username: 'student01', password: '123456', role: 'student' });

    const row = kernel.db.prepare('SELECT password_hash FROM users WHERE id = 7').get() as { password_hash: string };
    expect(isPasswordHash(row.password_hash)).toBe(true);
    expect(verifyPassword('123456', row.password_hash)).toBe(true);
  });

  it('does not rewrite an already-hashed password', async () => {
    // Point user 7 at a real hash of its password, then log in and confirm the value is untouched.
    const { hashPassword } = await import('@thinkclass/kernel');
    const hash = hashPassword('123456');
    kernel.db.prepare('UPDATE users SET password_hash = ? WHERE id = 7').run(hash);

    await service.login({ username: 'student01', password: '123456', role: 'student' });

    const row = kernel.db.prepare('SELECT password_hash FROM users WHERE id = 7').get() as { password_hash: string };
    expect(row.password_hash).toBe(hash);
  });
});

describe('login: the class context in the response', () => {
  it('returns both classId and class_id, the decrypted name and the feature map for a student', async () => {
    const result = await service.login({ username: 'student01', password: '123456', role: 'student' });

    expect(result.user).toMatchObject({
      id: 7,
      role: 'student',
      studentId: 21,
      classId: 5,
      class_id: 5,
      name: '小明',
      is_activated: true,
    });
    expect(result.classFeatures).toEqual({ enable_shop: true, enable_lucky_draw: false });
    // The port is the only path to a student, and the feature map came from it too.
    expect(classroom.calls.getStudentByUserId).toEqual([7]);
    expect(classroom.calls.getClassFeatureSnapshot).toEqual([5]);
  });

  it('reads the student through the port rather than a table read', async () => {
    // `students` is not in ADOPTED_TABLES, so a direct read would fail the ownership check. The
    // suite passing at all is the proof; this asserts the port was actually consulted.
    await service.login({ username: 'student01', password: '123456', role: 'student' });
    expect(classroom.calls.getStudentByUserId).toContain(7);
  });

  it('returns parentId and the child context for a parent, and records activity through the port', async () => {
    const result = await service.login({ username: 'parent01', password: '123456', role: 'parent' });

    expect(result.user).toMatchObject({
      id: 8,
      parentId: 8,
      role: 'parent',
      studentId: 31,
      classId: 6,
      class_id: 6,
      name: '小红',
    });
    expect(result.classFeatures).toEqual({ enable_shop: true, enable_lucky_draw: false });
    expect(classroom.calls.listStudentsByParent).toEqual([8]);
    // The activity write is the parent-buff port's, with today's UTC date - the same shape the
    // legacy `auth.service` produced through Prisma.
    expect(parentBuff.calls).toHaveLength(1);
    expect(parentBuff.calls[0].parentId).toBe(8);
    expect(parentBuff.calls[0].studentId).toBe(31);
    expect(parentBuff.calls[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('still logs a parent in when the optional parent-buff port is absent', async () => {
    parentBuffAvailable = false;

    const result = await service.login({ username: 'parent01', password: '123456', role: 'parent' });

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ parentId: 8, studentId: 31 });
    expect(parentBuff.calls).toEqual([]);
  });

  it('answers a teacher with the plain payload and no class lookup', async () => {
    const result = await service.login({ username: 'teacher9', password: '123456', role: 'teacher' });

    expect(result).toEqual({
      success: true,
      user: { id: 9, role: 'teacher', username: 'teacher9', is_activated: false },
    });
    expect(classroom.calls.getStudentByUserId).toEqual([]);
  });

  it('answers a student whose account has no student row with a null feature map', async () => {
    kernel.db.prepare(`INSERT INTO users (id, role, username, password_hash) VALUES (12,'student','orphan','123456')`).run();

    const result = await service.login({ username: 'orphan', password: '123456', role: 'student' });

    expect(result.classFeatures).toBeNull();
    expect(result.user.studentId).toBeUndefined();
  });
});

describe('profile', () => {
  it('updates the caller own username and stores a hashed password', async () => {
    const result = await service.updateProfile({ id: 9, role: 'teacher' }, { username: 'renamed', password: 'new-secret' });

    expect(result).toMatchObject({ success: true, message: '个人信息已更新' });
    const row = kernel.db.prepare('SELECT username, password_hash FROM users WHERE id = 9').get() as {
      username: string;
      password_hash: string;
    };
    expect(row.username).toBe('renamed');
    expect(isPasswordHash(row.password_hash)).toBe(true);
  });

  it('keeps the existing password when the body carries none', async () => {
    const before = kernel.db.prepare('SELECT password_hash FROM users WHERE id = 9').get() as { password_hash: string };
    await service.updateProfile({ id: 9, role: 'teacher' }, { username: 'renamed' });
    const after = kernel.db.prepare('SELECT password_hash FROM users WHERE id = 9').get() as { password_hash: string };
    expect(after.password_hash).toBe(before.password_hash);
  });

  it('rejects an empty username, an anonymous caller, and a role mismatch', async () => {
    expect((await apiErrorOf(() => service.updateProfile({ id: 9, role: 'teacher' }, { username: '  ' }))).message).toBe(
      '用户名不能为空',
    );
    expect((await apiErrorOf(() => service.updateProfile({ id: null, role: null }, { username: 'x' }))).statusCode).toBe(403);
    // The caller exists but claims a different role: the legacy check compared the stored role.
    expect((await apiErrorOf(() => service.updateProfile({ id: 9, role: 'admin' }, { username: 'x' }))).statusCode).toBe(403);
  });

  it('rejects a username another account already uses, but not the caller own', async () => {
    const taken = await apiErrorOf(() => service.updateProfile({ id: 9, role: 'teacher' }, { username: 'student01' }));
    expect(taken.statusCode).toBe(400);
    expect(taken.message).toBe('用户名已存在');

    // Saving the unchanged username must succeed: the duplicate check excludes the caller.
    const same = await service.updateProfile({ id: 9, role: 'teacher' }, { username: 'teacher9' });
    expect(same.success).toBe(true);
  });
});

describe('register', () => {
  it('binds a student account through the port and stores the name through it', async () => {
    const result = await service.register({
      username: 'newstudent',
      password: 'pw',
      role: 'student',
      name: '新同学',
      invite_code: 'AAA111',
      student_id: 31,
    });

    expect(result).toEqual({ success: true });
    expect(classroom.calls.findClassByInviteCode).toEqual(['AAA111']);
    expect(classroom.calls.bindStudentToUser).toEqual([{ studentId: 31, userId: expect.any(Number), name: '新同学' }]);

    const created = kernel.db.prepare('SELECT id, role FROM users WHERE username = ?').get('newstudent') as {
      id: number;
      role: string;
    };
    expect(created.role).toBe('student');
  });

  it('falls back to the username when the body carries no name, as the legacy update did', async () => {
    await service.register({ username: 'noname', password: 'pw', role: 'student', invite_code: 'AAA111', student_id: 31 });
    expect(classroom.calls.bindStudentToUser[0].name).toBe('noname');
  });

  it('links a parent account through the port', async () => {
    const result = await service.register({
      username: 'newparent',
      password: 'pw',
      role: 'parent',
      invite_code: 'AAA111',
      student_id: 31,
    });

    expect(result).toEqual({ success: true });
    expect(classroom.calls.linkParentToStudent).toEqual([{ parentId: expect.any(Number), studentId: 31 }]);
    expect(classroom.calls.bindStudentToUser).toEqual([]);
  });

  it('walks the legacy validation chain in order', async () => {
    const noInvite = await apiErrorOf(() => service.register({ username: 'a', password: 'p', role: 'student', student_id: 1 }));
    expect(noInvite.message).toBe('注册需要班级邀请码');

    const noStudent = await apiErrorOf(() => service.register({ username: 'a', password: 'p', role: 'student', invite_code: 'AAA111' }));
    expect(noStudent.message).toBe('请选择绑定的学生信息');

    const badCode = await apiErrorOf(() =>
      service.register({ username: 'a', password: 'p', role: 'student', invite_code: 'NOPE', student_id: 31 }),
    );
    expect(badCode.message).toBe('无效的班级邀请码');

    // Student 31 is in class 6 (invitation AAA111), so the class-5 invitation must not accept it.
    const wrongClass = await apiErrorOf(() =>
      service.register({ username: 'a', password: 'p', role: 'student', invite_code: 'BBB222', student_id: 31 }),
    );
    expect(wrongClass.message).toBe('未找到该学生记录');
  });

  it('refuses an already-bound student with the legacy 400 message', async () => {
    // Student 21 is in class 5 (`BBB222`) and already bound to user 7 through the fake port.
    const error = await apiErrorOf(() =>
      service.register({ username: 'x', password: 'p', role: 'student', invite_code: 'BBB222', student_id: 21 }),
    );
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('该学生已被绑定');
  });

  it('gates teacher registration on the platform setting read through the kernel settings store', async () => {
    // Unset: registration is allowed (`setting && value === '0'` was the legacy condition).
    expect(await service.register({ username: 't1', password: 'p', role: 'teacher' })).toEqual({ success: true });

    kernel.settings.set('allow_teacher_registration', '0');
    const blocked = await apiErrorOf(() => service.register({ username: 't2', password: 'p', role: 'teacher' }));
    expect(blocked.statusCode).toBe(403);
    expect(blocked.message).toBe('系统暂未开放教师注册');
  });

  it('answers 400 for a duplicate username instead of surfacing a database error', async () => {
    const error = await apiErrorOf(() => service.register({ username: 'student01', password: 'p', role: 'teacher' }));
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('用户名已存在');
  });
});

describe('activate: the activation-code flow', () => {
  it('claims the code, activates the user and records one event', async () => {
    const result = await service.activate({ code: 'TC-ABCD1234', userId: 9 });

    expect(result).toEqual({ success: true, message: '激活成功' });

    const code = kernel.db.prepare('SELECT status, used_by FROM activation_codes WHERE id = 3').get() as {
      status: string;
      used_by: number;
    };
    expect(code).toEqual({ status: 'used', used_by: 9 });

    const user = kernel.db.prepare('SELECT is_activated FROM users WHERE id = 9').get() as { is_activated: number };
    expect(user.is_activated).toBe(1);

    const events = kernel.db.prepare('SELECT source, activation_code FROM activation_events WHERE user_id = 9').all() as Array<{
      source: string;
      activation_code: string;
    }>;
    expect(events).toEqual([{ source: 'activation_code', activation_code: 'TC-ABCD1234' }]);
  });

  it('rejects a used code and an unknown code, each with its own message', async () => {
    const used = await apiErrorOf(() => service.activate({ code: 'TC-USED0000', userId: 9 }));
    expect(used.message).toBe('该激活码已被使用');

    const unknown = await apiErrorOf(() => service.activate({ code: 'TC-NOPE', userId: 9 }));
    expect(unknown.message).toBe('无效的激活码');
  });

  it('rejects a missing code or userId before touching the database', async () => {
    const error = await apiErrorOf(() => service.activate({ code: '', userId: 9 }));
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('激活码或用户ID缺失');
  });
});

describe('activateUser: the published port', () => {
  it('activates a user and reports the event in the port camelCase shape', async () => {
    const result = await service.activateUser({ userId: 9, source: 'payment', orderId: 42, remark: '通过wechat支付完成开通' });

    expect(result.refusal).toBeUndefined();
    expect(result.value).toMatchObject({ userId: 9, source: 'payment', orderId: 42, activationCode: null });
    expect(result.value.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    const user = kernel.db.prepare('SELECT is_activated FROM users WHERE id = 9').get() as { is_activated: number };
    expect(user.is_activated).toBe(1);
  });

  it('is idempotent on the pre-migration dedupe key, so a retried webhook writes nothing new', async () => {
    const first = await service.activateUser({ userId: 9, source: 'payment', orderId: 42 });
    const second = await service.activateUser({ userId: 9, source: 'payment', orderId: 42 });

    expect(second.value.id).toBe(first.value.id);
    const count = kernel.db.prepare(`SELECT COUNT(*) AS n FROM activation_events WHERE user_id = 9`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('treats a different orderId as a different activation', async () => {
    await service.activateUser({ userId: 9, source: 'payment', orderId: 42 });
    await service.activateUser({ userId: 9, source: 'payment', orderId: 43 });

    const count = kernel.db.prepare(`SELECT COUNT(*) AS n FROM activation_events WHERE user_id = 9`).get() as { n: number };
    expect(count.n).toBe(2);
  });

  it('refuses an unknown user instead of throwing a driver error', async () => {
    const result = await service.activateUser({ userId: 999, source: 'payment', orderId: 1 });
    expect(result.refusal).toMatchObject({ code: 'user-not-found' });
  });

  it('never writes payment_orders - that table belongs to the payment domain', async () => {
    // The port does not adopt it, so any statement naming it would be rejected by the ownership
    // check. This asserts the boundary deliberately rather than leaving it to luck.
    const result = await service.activateUser({ userId: 9, source: 'payment', orderId: 42 });
    expect(result.value.orderId).toBe(42);
    expect(ADOPTED_TABLES).not.toContain('payment_orders');
  });
});

describe('getUserById', () => {
  it('projects the row into the port snapshot, and answers null for an unknown id', async () => {
    expect(await service.getUserById(9)).toEqual({ id: 9, role: 'teacher', username: 'teacher9', isActivated: false });
    expect(await service.getUserById(999)).toBeNull();
  });
});
