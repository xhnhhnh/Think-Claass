/**
 * Engagement service tests - the domain's own tables, plus the three ports it now depends on.
 *
 * The suite it replaces (`api/modules/engagement/engagement.service.test.ts`) mocked `api/db.ts` and
 * `api/utils/classFeatures.ts`, so it could not observe the two things this migration actually
 * changed: that the pet write is gone (it used to be a raw `UPDATE pets`), and that the class gates
 * now arrive through a port whose refusals have to be mapped back onto the legacy statuses.
 *
 * Layers here:
 *
 *   - the schema comes from the real migration chain, through a real
 *     `createKernel({ inMemoryDatabase: true })`;
 *   - the repository runs through the real ownership-checked `DbApi` with `strict: true`, built
 *     from the manifest's `data.adopted` - so a statement naming `pets`, `students` or `classes`
 *     fails here exactly as it would in development. That is the proof the cross-plugin write is
 *     really gone, not just moved;
 *   - `classroom.public`, `identity.public` and `pet.public` are recording fakes, because those
 *     tables belong to other plugins.
 *
 * What the tests pin beyond the ported behaviour:
 *   - a praise reaches the pet port and does **not** touch `pets` directly;
 *   - the lucky draw debits through `spendStudentCredits` (one call, not two) and grants through
 *     `adjustPoints` + `recordStudentLedgerEntry`;
 *   - the 404-vs-403 mapping of every gate, which is hand-written and was the easiest thing to get
 *     backwards.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { IdentityPort } from '@thinkclass/contracts/domains/identity';
import type { PetPort, PetSnapshot } from '@thinkclass/contracts/domains/pet';
import { ApiError, createKernel, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createEngagementRepository } from '../../plugins/engagement/src/engagement.repository.js';
import { EngagementService } from '../../plugins/engagement/src/engagement.service.js';

/** Mirrors `plugins/engagement/plugin.json` -> `data.adopted`. */
const ADOPTED_TABLES = [
  'announcements',
  'certificates',
  'class_announcements',
  'danmaku_messages',
  'family_tasks',
  'lucky_draw_config',
  'messages',
  'praises',
  'redemption_tickets',
  'user_achievements',
];

interface Recorder {
  ledger: Array<{ studentId: number; type: string; amount: number }>;
  spends: Array<{ studentId: number; delta: number }>;
  adjustments: Array<{ studentId: number; delta: number; reason: string }>;
  petGrants: Array<{ studentId: number; expGain: number; mood: string }>;
  userLookups: number[];
}

let kernel: Kernel;
let api: DbApi;
let service: EngagementService;
let calls: Recorder;
let features: Record<string, boolean>;
let student: StudentSnapshot | null;

function createPorts() {
  const classroom: ClassroomPort = {
    async getStudentById(studentId) {
      return student && student.id === studentId ? student : null;
    },
    async getStudentByUserId(userId) {
      return student && student.userId === userId ? student : null;
    },
    async getClassById(classId) {
      return classId === 1 ? { id: 1, name: '一班', teacherId: 7, inviteCode: 'AAA111' } : null;
    },
    async findClassByInviteCode(code) {
      return code === 'AAA111' ? { id: 1, name: '一班', teacherId: 7, inviteCode: 'AAA111' } : null;
    },
    async listClassStudents() {
      return student ? [student] : [];
    },
    async listStudentsByParent(parentId) {
      return parentId === 8 && student ? [student] : [];
    },
    async searchClasses() {
      return [];
    },
    async assertStudentInClass() {
      /* unused */
    },
    async adjustPoints({ studentId, delta, reason }) {
      calls.adjustments.push({ studentId, delta, reason });
      return { totalPoints: 0, availablePoints: 0 };
    },
    async transferStudentCredits() {
      return { value: { availablePoints: 0 } };
    },
    async recordStudentLedgerEntry(entry) {
      calls.ledger.push({ studentId: entry.studentId, type: entry.type, amount: entry.amount });
    },
    async listStudentLedger() {
      return [];
    },
    async sumClassPointsEarnedSince() {
      return 0;
    },
    async spendStudentCredits({ studentId, delta, entry }) {
      calls.spends.push({ studentId, delta });
      calls.ledger.push({ studentId: entry.studentId, type: entry.type, amount: entry.amount });
      return { value: { availablePoints: (student?.availablePoints ?? 0) + delta } };
    },
    async getClassIdByStudentId() {
      return student?.classId ?? null;
    },
    async listStudentNamesByIds(ids) {
      const names: Record<number, string> = {};
      for (const id of ids) if (student && student.id === id) names[id] = student.name;
      return names;
    },
    async getClassFeatureSnapshot(classId) {
      return classId === 1 ? { ...features } : null;
    },
    async checkClassFeature(_classId, feature) {
      return features[feature] ? { value: true } : { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
    },
    async checkAnyClassFeature(_classId, list) {
      return list.some((feature) => features[feature])
        ? { value: true }
        : { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
    },
    async checkStudentFeature(_studentId, feature) {
      return features[feature] ? { value: true } : { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
    },
    async linkParentToStudent() {
      /* unused */
    },
    async bindStudentToUser() {
      return { value: student as StudentSnapshot };
    },
  };

  const identity: IdentityPort = {
    async getUserById(userId) {
      calls.userLookups.push(userId);
      return userId === 7 ? { id: 7, role: 'teacher', username: 'teacher7', isActivated: true } : null;
    },
    async activateUser() {
      return { value: undefined };
    },
    async getFirstUserIdByRole(role) {
      return role === 'teacher' ? 7 : null;
    },
  };

  const pet: PetPort = {
    async getPetForStudent() {
      return null;
    },
    async hasPet() {
      return true;
    },
    async getBattleProfile() {
      return null;
    },
    async grantPetExperience({ studentId, expGain, mood }): Promise<PetSnapshot | null> {
      calls.petGrants.push({ studentId, expGain, mood });
      return { id: 1, studentId, elementType: 'fire', level: 2, experience: 120, attackPower: 12, isDead: false };
    },
  };

  return { classroom, identity, pet };
}

async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

beforeEach(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent' },
    migrations: APP_MIGRATIONS,
  });

  api = createDbApi({
    db: kernel.db,
    pluginId: 'engagement',
    ownedTables: new Set(ADOPTED_TABLES),
    readTables: new Set(['shop_items']),
    strict: true,
  });

  calls = { ledger: [], spends: [], adjustments: [], petGrants: [], userLookups: [] };
  features = { enable_danmaku: true, enable_tree_hole: true, enable_family_tasks: true, enable_achievements: true };
  student = { id: 20, classId: 1, userId: 9, name: '小明', totalPoints: 100, availablePoints: 100, groupId: null };

  const ports = createPorts();
  service = new EngagementService({
    ctx: { log: kernel.logger, db: api } as never,
    repository: createEngagementRepository(api),
    classroom: ports.classroom,
    identity: () => ports.identity,
    pet: () => ports.pet,
  });

  kernel.db.exec(`
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'AAA111');
    INSERT INTO students (id, user_id, class_id, name) VALUES (20, 9, 1, '小明');
    INSERT INTO users (id, role, username, password_hash) VALUES (7, 'teacher', 'teacher7', 'x');
    INSERT INTO shop_items (id, name, price, teacher_id) VALUES (3, '免抄写卡', 50, 7);
  `);
});

afterEach(async () => {
  await kernel.shutdown();
});

// ---------------------------------------------------------------------------

describe('the ownership boundary', () => {
  it('cannot touch the tables this domain does not own', () => {
    // The proof that the pet write is gone rather than relocated: any statement naming another
    // plugin's table is rejected here, so a future edit that reintroduces one fails loudly.
    expect(() => api.run(`UPDATE pets SET mood = 'excited' WHERE student_id = 20`)).toThrow(/may not write to table "pets"/);
    expect(() => api.run(`UPDATE students SET available_points = 0 WHERE id = 20`)).toThrow(
      /may not write to table "students"/,
    );
    expect(() => api.run(`INSERT INTO records (student_id, type, amount) VALUES (20, 'X', 1)`)).toThrow(
      /may not write to table "records"/,
    );
  });
});

describe('praises', () => {
  it('writes the praise and grows the pet through the port, never through `pets`', async () => {
    const praise = await service.createPraise({ teacher_id: 7, student_id: 20, content: '很棒' });

    expect(praise).toMatchObject({ teacher_id: 7, student_id: 20, content: '很棒', color: 'bg-yellow-100' });
    expect(calls.petGrants).toEqual([{ studentId: 20, expGain: 20, mood: 'excited' }]);
    // The row is really in this plugin's table.
    const stored = kernel.db.prepare('SELECT content FROM praises WHERE id = ?').get(praise.id) as { content: string };
    expect(stored.content).toBe('很棒');
  });

  it('still records the praise when the pet port is unavailable', async () => {
    const ports = createPorts();
    const withoutPet = new EngagementService({
      ctx: { log: kernel.logger, db: api } as never,
      repository: createEngagementRepository(api),
      classroom: ports.classroom,
      identity: () => ports.identity,
      pet: () => null,
    });

    const praise = await withoutPet.createPraise({ teacher_id: 7, student_id: 20, content: '没有宠物' });
    expect(praise).toMatchObject({ content: '没有宠物' });
    expect(calls.petGrants).toEqual([]);
  });

  it('returns praises for a class with names resolved through the classroom port', async () => {
    await service.createPraise({ teacher_id: 7, student_id: 20, content: '一' });
    const praises = await service.getPraisesByClass(1);

    expect(praises).toHaveLength(1);
    expect(praises[0]).toMatchObject({ content: '一', student_name: '小明' });
  });
});

describe('the class gates: 404 for a missing class, 403 when the flag is off', () => {
  it('answers 403 该功能当前已关闭 when the feature is off', async () => {
    features.enable_danmaku = false;
    const error = await apiErrorOf(() => service.getDanmakuMessages(1, undefined));
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('该功能当前已关闭');
  });

  it('answers 404 班级未找到 when the class does not exist', async () => {
    const error = await apiErrorOf(() => service.getDanmakuMessages(999, undefined));
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('班级未找到');
  });

  it('answers 404 学生未找到 when the gated student has no row', async () => {
    // `assertStudentFeatureEnabled` resolved the class *from the student*, so a missing student was
    // the legacy 404 - not the class gate's refusal.
    const error = await apiErrorOf(() => service.getFamilyTasks({ studentId: 999 }));
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('学生未找到');
  });

  it('gates the parent form on the parent first child class', async () => {
    features.enable_family_tasks = false;
    const error = await apiErrorOf(() => service.getFamilyTasks({ parentId: 8 }));
    expect(error.statusCode).toBe(403);

    features.enable_family_tasks = true;
    expect(await service.getFamilyTasks({ parentId: 8 })).toEqual([]);

    // A parent with no children is the legacy 404 from `getClassIdByUserId`.
    const noChild = await apiErrorOf(() => service.getFamilyTasks({ parentId: 999 }));
    expect(noChild.statusCode).toBe(404);
    expect(noChild.message).toBe('班级未找到');
  });

  it('passes the tree-hole gate when either of its two flags is on', async () => {
    features.enable_tree_hole = false;
    features.enable_chat_bubble = true;
    expect(await service.createMessage({ class_id: 1, sender_id: 20, content: 'x', type: 'TREE_HOLE' })).toBeDefined();

    features.enable_chat_bubble = false;
    const error = await apiErrorOf(() =>
      service.createMessage({ class_id: 1, sender_id: 20, content: 'x', type: 'TREE_HOLE' }),
    );
    expect(error.statusCode).toBe(403);
  });
});

describe('lucky draw', () => {
  async function configure(prizes: Array<{ prize_name: string; prize_type: string; prize_value: unknown; probability: number }>) {
    await service.updateLuckyDrawConfig({ teacher_id: 7, cost_points: 10, configs: prizes });
  }

  it('debits through one port call and appends the ledger row with it', async () => {
    await configure([{ prize_name: '谢谢参与', prize_type: 'NONE', prize_value: null, probability: 100 }]);

    const result = await service.drawLuckyPrize(20);

    expect(result.status).toBe(200);
    // One call, not `transferStudentCredits` + `recordStudentLedgerEntry`: the pair used to be one
    // transaction and a crash between two calls would leave a debit with no ledger row.
    expect(calls.spends).toEqual([{ studentId: 20, delta: -10 }]);
  });

  it('grants a points prize through adjustPoints plus a ledger row', async () => {
    await configure([{ prize_name: '大奖', prize_type: 'POINTS', prize_value: 50, probability: 100 }]);

    const result = await service.drawLuckyPrize(20);

    expect(result.body.message).toBe('恭喜获得 50 积分！');
    expect(calls.adjustments).toEqual([{ studentId: 20, delta: 50, reason: '抽奖获得: 大奖' }]);
    expect(calls.ledger).toEqual([
      { studentId: 20, type: 'LUCKY_DRAW', amount: -10 },
      { studentId: 20, type: 'LUCKY_DRAW_WIN', amount: 50 },
    ]);
  });

  it('issues a redemption ticket for an item prize, in its own table', async () => {
    await configure([{ prize_name: '免抄写卡', prize_type: 'ITEM', prize_value: 3, probability: 100 }]);

    const result = await service.drawLuckyPrize(20);
    expect(result.body.message).toContain('免抄写卡');

    const tickets = kernel.db.prepare('SELECT student_id, item_id, status FROM redemption_tickets').all();
    expect(tickets).toEqual([{ student_id: 20, item_id: 3, status: 'pending' }]);
  });

  it('answers 409 积分不足 before spending anything', async () => {
    await configure([{ prize_name: 'x', prize_type: 'NONE', prize_value: null, probability: 100 }]);
    student = { ...(student as StudentSnapshot), availablePoints: 5 };

    const result = await service.drawLuckyPrize(20);
    expect(result.status).toBe(409);
    expect(calls.spends).toEqual([]);
  });

  it('answers 404 for a missing student and for no active config', async () => {
    expect((await service.drawLuckyPrize(999)).body.message).toBe('Student not found');
    expect((await service.drawLuckyPrize(20)).body.message).toBe('No active lucky draw config');
  });

  it('falls back to the first teacher when the config request omits teacherId', async () => {
    // This is the identity port's reason for existing in this domain.
    const result = await service.getLuckyDrawConfig(undefined);
    expect(result).toEqual({ configs: [], cost_points: 10 });

    await configure([{ prize_name: 'x', prize_type: 'NONE', prize_value: null, probability: 100 }]);
    const withConfig = await service.getLuckyDrawConfig(undefined);
    expect(withConfig.configs).toHaveLength(1);
    expect(withConfig.cost_points).toBe(10);
    expect(calls.userLookups).toEqual([]);
  });
});

describe('messages', () => {
  it('resolves sender names, the anonymity override and the achievement title via ports', async () => {
    kernel.db
      .prepare(
        `INSERT INTO user_achievements (student_id, achievement_name, unlocked_at)
         VALUES (20, '初出茅庐', '2026-01-01 00:00:00')`,
      )
      .run();

    await service.createMessage({ class_id: 1, sender_id: 20, content: '大家好', type: 'TREE_HOLE' });
    const messages = await service.getMessages({ classId: 1 });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ content: '大家好', sender_name: '小明', sender_title: '初出茅庐' });

    // The anonymity override wins over the title, and only for a non-teacher viewer.
    //
    // Found by content, not by index: `created_at` comes from SQLite's CURRENT_TIMESTAMP at
    // second precision, so two messages written in the same second have equal timestamps and the
    // `ORDER BY created_at DESC` between them is undefined. Indexing [0] made this assertion
    // flaky the moment the wall clock crossed a second boundary.
    await service.createMessage({ class_id: 1, sender_id: 20, content: '匿名', type: 'TREE_HOLE', is_anonymous: 1 });
    const anonymous = (await service.getMessages({ classId: 1, role: 'student' })).find(
      (message) => message.content === '匿名',
    ) as Record<string, unknown>;
    expect(anonymous).toMatchObject({ sender_name: '匿名同学' });
    expect(anonymous).not.toHaveProperty('sender_title');

    const asTeacher = (await service.getMessages({ classId: 1, role: 'teacher' })).find(
      (message) => message.content === '匿名',
    ) as Record<string, unknown>;
    expect(asTeacher.sender_name).toBe('小明');
  });

  it('leaves the title off when the class has achievements switched off', async () => {
    features.enable_achievements = false;
    kernel.db
      .prepare(
        `INSERT INTO user_achievements (student_id, achievement_name, unlocked_at)
         VALUES (20, '初出茅庐', '2026-01-01 00:00:00')`,
      )
      .run();

    await service.createMessage({ class_id: 1, sender_id: 20, content: 'x', type: 'TREE_HOLE' });
    const [message] = await service.getMessages({ classId: 1 });
    expect(message).not.toHaveProperty('sender_title');
  });

  it('does not select the helper columns into the response', async () => {
    await service.createMessage({ class_id: 1, sender_id: 20, content: 'x', type: 'TREE_HOLE' });
    const [message] = await service.getMessages({ classId: 1 });
    expect(message).not.toHaveProperty('enable_achievements');
    expect(message).not.toHaveProperty('top_achievement');
  });
});

describe('certificates, redemption and danmaku', () => {
  it('attaches student names to certificates through one port call', async () => {
    service.createCertificate({ student_id: 20, title: '进步之星' });
    const certificates = await service.getCertificates(undefined);
    expect(certificates).toHaveLength(1);
    expect(certificates[0]).toMatchObject({ title: '进步之星', student_name: '小明' });
  });

  it('verifies a ticket once: 404 unknown, 400 already used, 200 then used', async () => {
    kernel.db
      .prepare(`INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (20, 3, 'RED-AAA', 'pending')`)
      .run();

    expect((await service.verifyRedemption('NOPE')).status).toBe(404);

    const first = await service.verifyRedemption('RED-AAA');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ success: true, message: '核销成功' });
    expect(first.body.ticket).toMatchObject({ student_name: '小明', status: 'used' });

    const second = await service.verifyRedemption('RED-AAA');
    expect(second.status).toBe(400);
    expect(second.body.message).toBe('该凭证已被核销');
  });

  it('returns the newest 50 danmaku messages oldest-first, and keeps 1000 on cleanup', async () => {
    for (let i = 0; i < 3; i += 1) {
      await service.createDanmakuMessage({ class_id: 1, sender_name: '甲', content: `第${i}条` });
    }

    const messages = await service.getDanmakuMessages(1, undefined);
    expect(messages.map((message) => message.content)).toEqual(['第0条', '第1条', '第2条']);

    const since = await service.getDanmakuMessages(1, 1);
    expect(since.map((message) => message.content)).toEqual(['第1条', '第2条']);

    service.cleanupDanmakuMessages();
    const remaining = kernel.db.prepare('SELECT COUNT(*) AS n FROM danmaku_messages').get() as { n: number };
    expect(remaining.n).toBe(3);
  });
});
