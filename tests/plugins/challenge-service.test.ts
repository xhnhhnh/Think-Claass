/**
 * ChallengeService unit tests.
 *
 * Rewritten for the plugin world in P4.3b. The pre-migration test
 * (`api/modules/challenge/challenge.service.test.ts`) faked a repository that also
 * owned `students` and `records` and mocked `api/utils/classFeatures.ts`; both of those
 * moved behind `classroom.public`, so the test now fakes a *port* as well and can
 * assert the thing that actually matters: that points, the class roster, the feature
 * gates and the shared ledger are reached through the port, and that a refusal does
 * not leave a half-applied reward behind.
 *
 * The behavioural expectations are carried over from the pre-migration test: the same
 * scoring (2 points per correct answer), the same class-wide reward on a boss kill
 * (`level * 50`), and the same default pet damage of 10.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, PointLedgerEntry, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { PetPort } from '@thinkclass/contracts/domains/pet';
import { ApiError } from '@thinkclass/kernel';

import { createChallengeRepository } from '../../plugins/challenge/src/challenge.repository.js';
import { ChallengeService } from '../../plugins/challenge/src/challenge.service.js';
import type {
  ChallengeBossInput,
  ChallengeQuestionRow,
  ChallengeRepository,
  WorldBossDto,
} from '../../plugins/challenge/src/challenge.types.js';

class FakeChallengeRepository implements ChallengeRepository {
  questions = new Map<number, ChallengeQuestionRow>();
  bosses = new Map<number, WorldBossDto>();
  challengeRecords: Array<{ studentId: number; score: number; correctCount: number; wrongCount: number }> = [];
  nextBossId = 10;

  listQuestions(limit: number) {
    return [...this.questions.values()].slice(0, limit);
  }
  getQuestion(questionId: number) {
    return this.questions.get(questionId) ?? null;
  }
  insertChallengeRecord(studentId: number, score: number, correctCount: number, wrongCount: number) {
    this.challengeRecords.push({ studentId, score, correctCount, wrongCount });
  }
  listBosses() {
    return [...this.bosses.values()].sort((a, b) => b.id - a.id);
  }
  getActiveBoss() {
    return this.listBosses().find((boss) => boss.status === 'active') ?? null;
  }
  getBoss(bossId: number, activeOnly = false) {
    const boss = this.bosses.get(bossId) ?? null;
    if (activeOnly && boss?.status !== 'active') return null;
    return boss;
  }
  createBoss(input: ChallengeBossInput) {
    const id = this.nextBossId++;
    this.bosses.set(id, {
      id,
      name: input.name,
      description: input.description,
      hp: input.hp,
      max_hp: input.hp,
      level: input.level,
      status: 'active',
    });
    return id;
  }
  updateBossHp(bossId: number, hp: number, status: string) {
    const boss = this.bosses.get(bossId)!;
    this.bosses.set(bossId, { ...boss, hp, status });
  }
  deleteBoss(bossId: number) {
    this.bosses.delete(bossId);
  }
}

/**
 * A fake pet domain: the damage roll reads `attackPower` through the port now, instead of
 * selecting `pets.attack_power` from another plugin's table.
 */
class FakePetPort implements PetPort {
  attackPower = new Map<number, number>();

  async getPetForStudent(studentId: number) {
    const power = this.attackPower.get(studentId);
    if (power === undefined) return null;
    return {
      id: studentId,
      studentId,
      elementType: 'fire',
      level: 1,
      experience: 0,
      attackPower: power,
      isDead: false,
    };
  }
  async hasPet(studentId: number) {
    return this.attackPower.has(studentId);
  }
  async getBattleProfile(studentId: number) {
    const power = this.attackPower.get(studentId);
    if (power === undefined) return null;
    return { attackPower: power, level: 1, isDead: false };
  }
}

/**
 * A fake classroom: the student rows, the class roster, the feature gates and the
 * shared ledger live here, exactly as they do behind the real port.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): challenge never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, StudentSnapshot>();
  /** `students.user_id` -> student id, for the legacy actor-scoped gate. */
  userIds = new Map<number, number>();
  /** `${classId}:${feature}` keys turned off, the shape of a disabled `enable_*`. */
  disabledFeatures = new Set<string>();
  ledger: PointLedgerEntry[] = [];
  adjustments: Array<{ studentId: number; delta: number; reason: string }> = [];

  async getStudentById(studentId: number) {
    return this.students.get(studentId) ?? null;
  }
  async getStudentByUserId(userId: number) {
    const studentId = this.userIds.get(userId);
    return studentId === undefined ? null : (this.students.get(studentId) ?? null);
  }
  async getClassById(classId: number) {
    return classId === 3 ? { id: 3, name: '一班', teacherId: 7, inviteCode: 'ABC' } : null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()].filter((student) => student.classId === classId);
  }
  async searchClasses() {
    return [];
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const student = this.students.get(studentId);
    if (!student || student.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints(input: { studentId: number; delta: number; reason: string; actorId: number }) {
    const student = this.students.get(input.studentId);
    if (!student) throw new Error(`学生不存在: ${input.studentId}`);
    const next: StudentSnapshot = {
      ...student,
      totalPoints: student.totalPoints + input.delta,
      availablePoints: student.availablePoints + input.delta,
    };
    this.students.set(input.studentId, next);
    this.adjustments.push({ studentId: input.studentId, delta: input.delta, reason: input.reason });
    return { totalPoints: next.totalPoints, availablePoints: next.availablePoints };
  }
  async transferStudentCredits() {
    throw new Error('challenge spends no credits; it only awards points');
  }
  async recordStudentLedgerEntry(entry: PointLedgerEntry) {
    this.ledger.push({ ...entry });
  }
  async listStudentLedger() {
    return [];
  }
  async sumClassPointsEarnedSince() {
    return 0;
  }
  async checkStudentFeature(studentId: number, feature: string) {
    const student = this.students.get(studentId);
    if (!student) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    if (this.disabledFeatures.has(`${student.classId}:${feature}`)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
  async checkClassFeature(classId: number, feature: string) {
    if (classId !== 3) return { refusal: { code: 'class-not-found' as const, message: '班级未找到' } };
    if (this.disabledFeatures.has(`${classId}:${feature}`)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
}

function setup() {
  const repository = new FakeChallengeRepository();
  const classroom = new FakeClassroom();
  const pets = new FakePetPort();

  repository.questions.set(1, { id: 1, title: '单选', type: 'SINGLE', options: '["A","B"]', answer: 'A', explanation: '因为 A' });
  repository.questions.set(2, { id: 2, title: '多选', type: 'MULTIPLE', options: '["A","B"]', answer: '["A","B"]', explanation: '' });

  classroom.students.set(1, { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 0, availablePoints: 0 });
  classroom.students.set(2, { id: 2, classId: 3, userId: 200, name: '小红', totalPoints: 0, availablePoints: 0 });
  classroom.userIds.set(100, 1);
  classroom.userIds.set(200, 2);

  repository.bosses.set(5, { id: 5, name: 'Boss', description: '', hp: 30, max_hp: 30, level: 2, status: 'active' });
  pets.attackPower.set(1, 35);

  // The third argument is a resolver, not the port: the service resolves it per call because
  // plugins initialise in slug order and `pet` does not exist during challenge's setup.
  const service = new ChallengeService(repository, classroom, () => pets);
  return { repository, classroom, pets, service, withoutPets: new ChallengeService(repository, classroom) };
}

describe('ChallengeService', () => {
  let repository: FakeChallengeRepository;
  let classroom: FakeClassroom;
  let pets: FakePetPort;
  let service: ChallengeService;
  let withoutPets: ChallengeService;

  beforeEach(() => {
    ({ repository, classroom, pets, service, withoutPets } = setup());
  });

  it('parses question options', async () => {
    const questions = await service.getQuestions(1, 1);
    expect(questions[0].options).toEqual(['A', 'B']);
  });

  it('scores single and multiple answers, paying through the port and logging the attempt', async () => {
    const result = await service.submitAnswers(1, {
      1: 'A',
      2: ['B', 'A'],
    });

    expect(result.score).toBe(4);
    expect(result.correctCount).toBe(2);
    // 2 points per correct answer, added to both halves of the balance by the port.
    expect(classroom.students.get(1)?.availablePoints).toBe(4);
    expect(classroom.students.get(1)?.totalPoints).toBe(4);
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'CHALLENGE_REWARD', amount: 4, description: '挑战模式加分' },
    ]);
    expect(repository.challengeRecords[0]).toEqual({ studentId: 1, score: 4, correctCount: 2, wrongCount: 0 });
  });

  it('writes the attempt row even when nothing was scored', async () => {
    const result = await service.submitAnswers(1, { 1: 'B' });

    expect(result.score).toBe(0);
    expect(result.wrongCount).toBe(1);
    expect(classroom.ledger).toHaveLength(0);
    expect(repository.challengeRecords[0]).toEqual({ studentId: 1, score: 0, correctCount: 0, wrongCount: 1 });
  });

  it('reports a missing student as 404 before the feature gate', async () => {
    await expect(service.submitAnswers(999, { 1: 'A' })).rejects.toMatchObject({ status: 404 });
    await expect(service.getQuestions(10, 999)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects the whole submission when the class has challenge disabled', async () => {
    classroom.disabledFeatures.add('3:enable_challenge');

    await expect(service.submitAnswers(1, { 1: 'A' })).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
    // The gate runs before any write: nothing was paid and no attempt was logged.
    expect(classroom.students.get(1)?.availablePoints).toBe(0);
    expect(classroom.ledger).toHaveLength(0);
    expect(repository.challengeRecords).toHaveLength(0);
  });

  it('attacks bosses with pet power and rewards the whole class when defeated', async () => {
    const result = await service.attackBoss(5, 1);

    expect(result).toEqual({ defeated: true, damage: 35, newHp: 0, rewardPoints: 100 });
    expect(repository.bosses.get(5)?.status).toBe('defeated');
    expect(classroom.students.get(1)?.availablePoints).toBe(100);
    expect(classroom.students.get(2)?.availablePoints).toBe(100);
    expect(classroom.ledger.map((entry) => entry.type)).toEqual(['BOSS_REWARD', 'BOSS_REWARD', 'BOSS_ATTACK']);
    expect(classroom.ledger[0]).toEqual({
      studentId: 1,
      type: 'BOSS_REWARD',
      amount: 100,
      description: '世界Boss被击败奖励',
    });
    expect(classroom.ledger[2]).toMatchObject({ studentId: 1, type: 'BOSS_ATTACK', amount: 0 });
  });

  it('falls back to 10 damage, leaves the boss active and pays nobody otherwise', async () => {
    pets.attackPower.delete(1);

    const result = await service.attackBoss(5, 1);

    expect(result).toEqual({ defeated: false, damage: 10, newHp: 20, rewardPoints: 0 });
    expect(repository.bosses.get(5)?.status).toBe('active');
    expect(classroom.adjustments).toHaveLength(0);
    expect(classroom.ledger.map((entry) => entry.type)).toEqual(['BOSS_ATTACK']);
  });

  it('works without the pet plugin at all, still defaulting to 10 damage', async () => {
    // `ctx.tryUse('pet.public')` returns null when pet is disabled. The old implementation
    // read `pets.attack_power` straight from another plugin's table, so this case did not
    // exist for it - a disabled pet plugin meant a missing table, not a fallback.
    const result = await withoutPets.attackBoss(5, 1);

    expect(result).toEqual({ defeated: false, damage: 10, newHp: 20, rewardPoints: 0 });
    expect(classroom.ledger.map((entry) => entry.type)).toEqual(['BOSS_ATTACK']);
  });

  it('rejects an attack on a boss that is already defeated', async () => {
    repository.bosses.set(5, { ...repository.bosses.get(5)!, status: 'defeated' });

    await expect(service.attackBoss(5, 1)).rejects.toMatchObject({
      status: 404,
      message: 'Boss not found or already defeated',
    });
  });

  it('gates the active boss on the class flag and the attack on the student flag', async () => {
    classroom.disabledFeatures.add('3:enable_world_boss');

    await expect(service.getActiveBoss(3)).rejects.toMatchObject({ status: 403, message: '该功能当前已关闭' });
    await expect(service.attackBoss(5, 1)).rejects.toMatchObject({ status: 403, message: '该功能当前已关闭' });
  });

  it('reports an unknown class as 404 for the class-scoped boss query', async () => {
    await expect(service.getActiveBoss(9)).rejects.toMatchObject({ status: 404, message: '班级未找到' });
  });

  it('supports teacher boss CRUD without a feature gate', () => {
    const created = service.createBoss({ name: '龙王', hp: 100, level: 2 });
    expect(created.id).toBe(10);
    expect(service.listBosses()[0]).toMatchObject({ id: 10, name: '龙王', max_hp: 100, level: 2, status: 'active' });

    expect(service.deleteBoss(10)).toEqual({ deleted: true });
    expect(repository.bosses.has(10)).toBe(false);
  });

  it('validates boss input and reports a missing boss on delete', () => {
    expect(() => service.createBoss({ name: '  ', hp: 1 })).toThrow(ApiError);
    expect(() => service.createBoss({ name: 'x', hp: 0 })).toThrow(ApiError);
    expect(() => service.deleteBoss(999)).toThrow(ApiError);
  });

  /**
   * The legacy actor-scoped alias: `GET /api/challenge/questions` gated a *student*
   * caller on their class flag, resolving `students.user_id = actor.id` (404 when no
   * student matched) and then 403 when the flag was off. Neither the kernel actor nor
   * the tables are reachable from a plugin, so the lookup is a port call.
   */
  it('resolves the legacy actor gate through the port', async () => {
    await expect(service.assertActorCanReadQuestions(100)).resolves.toBeUndefined();
    await expect(service.assertActorCanReadQuestions(999)).rejects.toMatchObject({
      status: 404,
      message: '班级未找到',
    });

    classroom.disabledFeatures.add('3:enable_challenge');
    await expect(service.assertActorCanReadQuestions(100)).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so
 * it is worth one test that the plugin's `DbApi` is what it actually reaches for - and
 * that it never touches `students` or `records`, both of which moved behind the port.
 */
describe('createChallengeRepository', () => {
  it('touches only the tables challenge declared', () => {
    const seen: string[] = [];
    const stub = {
      get: (sql: string) => {
        seen.push(sql);
        return undefined;
      },
      query: (sql: string) => {
        seen.push(sql);
        return [];
      },
      run: (sql: string) => {
        seen.push(sql);
        return { changes: 0, lastInsertRowid: 0 };
      },
      tx: <T>(fn: (tx: unknown) => T) => fn(stub),
      exec: () => {},
    };

    const repository = createChallengeRepository(stub as never);
    repository.listQuestions(5);
    repository.getQuestion(1);
    repository.insertChallengeRecord(1, 4, 2, 0);
    repository.listBosses();
    repository.getActiveBoss();
    repository.getBoss(1);
    repository.createBoss({ name: 'Boss', description: '', hp: 10, level: 1, start_time: null, end_time: null });
    repository.updateBossHp(1, 5, 'active');
    repository.deleteBoss(1);

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    // `pets` is no longer in this set: the damage roll goes through pet.public.
    expect([...touched].sort()).toEqual(['challenge_records', 'question_bank', 'world_bosses']);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('records');
    expect([...touched]).not.toContain('pets');
  });
});
