/**
 * DungeonService unit tests.
 *
 * Rewritten for the plugin world in P4.3b. The pre-migration test faked a
 * `DungeonRepository` that also owned `students` and `records`; both of those moved
 * behind `classroom.public`, so the test now fakes a *port* as well and can assert the
 * thing that actually matters: that the feature gate, the spendable balance and the
 * shared ledger are reached through the port, and that the repository never touches a
 * table this plugin does not own.
 *
 * The behavioural expectations are carried over unchanged from
 * `api/modules/dungeon/dungeon.service.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';

import { createDungeonRepository } from '../../plugins/dungeon/src/dungeon.repository.js';
import { DungeonService } from '../../plugins/dungeon/src/dungeon.service.js';
import type { DungeonRepository, DungeonRunRow } from '../../plugins/dungeon/src/dungeon.types.js';

class FakeDungeonRepository implements DungeonRepository {
  runs = new Map<number, DungeonRunRow>();
  nextId = 1;

  transaction<T>(fn: () => T): T {
    return fn();
  }
  getActiveRun(studentId: number) {
    return [...this.runs.values()].find((run) => run.student_id === studentId && run.status === 'active') ?? null;
  }
  getBestFloor(studentId: number) {
    return Math.max(
      0,
      ...[...this.runs.values()].filter((run) => run.student_id === studentId).map((run) => run.max_floor),
    );
  }
  endActiveRuns(studentId: number) {
    for (const [id, run] of this.runs) {
      if (run.student_id === studentId && run.status === 'active') this.runs.set(id, { ...run, status: 'died' });
    }
  }
  createRun(studentId: number) {
    const id = this.nextId++;
    this.runs.set(id, {
      id,
      student_id: studentId,
      current_floor: 1,
      max_floor: 1,
      active_buffs: '[]',
      current_hp: 100,
      max_hp: 100,
      status: 'active',
    });
    return id;
  }
  updateRun(
    runId: number,
    input: { currentFloor: number; maxFloor: number; currentHp: number; activeBuffs: string[]; status: string },
  ) {
    const run = this.runs.get(runId)!;
    this.runs.set(runId, {
      ...run,
      current_floor: input.currentFloor,
      max_floor: input.maxFloor,
      current_hp: input.currentHp,
      active_buffs: JSON.stringify(input.activeBuffs),
      status: input.status as DungeonRunRow['status'],
    });
  }
}

/**
 * A fake classroom: the student balance, the class feature flag and the ledger live
 * here, exactly as they do behind the real port.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): dungeon never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, { snapshot: StudentSnapshot; featureEnabled: boolean }>();
  classes = new Map<number, { id: number; name: string; teacherId: number | null; inviteCode: string; featureEnabled: boolean }>();
  ledger: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  /** Set to make `transferStudentCredits` refuse, for the failure-path test. */
  failCredits: ClassroomRefusal | null = null;

  async getStudentById(studentId: number) {
    return this.students.get(studentId)?.snapshot ?? null;
  }
  async getClassById(classId: number) {
    const row = this.classes.get(classId);
    return row ? { id: row.id, name: row.name, teacherId: row.teacherId, inviteCode: row.inviteCode } : null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()].map((entry) => entry.snapshot).filter((s) => s.classId === classId);
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const entry = this.students.get(studentId);
    if (!entry || entry.snapshot.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints() {
    throw new Error('not used by dungeon');
  }
  async awardStudentPoints(input: { studentId: number; amount: number; type: string; description: string }) {
    if (this.failCredits) throw Object.assign(new Error(this.failCredits.message), { status: 404 });
    const entry = this.students.get(input.studentId);
    if (!entry) throw Object.assign(new Error('学生未找到'), { status: 404 });
    entry.snapshot = { ...entry.snapshot, totalPoints: entry.snapshot.totalPoints + input.amount, availablePoints: entry.snapshot.availablePoints + input.amount };
    this.ledger.push({ studentId: input.studentId, type: input.type, amount: input.amount, description: input.description });
    return { totalPoints: entry.snapshot.totalPoints, availablePoints: entry.snapshot.availablePoints };
  }
  async transferStudentCredits(input: { studentId: number; delta: number }) {
    if (this.failCredits) return { refusal: this.failCredits };
    const entry = this.students.get(input.studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };

    const available = entry.snapshot.availablePoints + input.delta;
    if (input.delta < 0 && available < 0) {
      return { refusal: { code: 'insufficient-credits' as const, message: '积分不足' } };
    }
    // Only the spendable half moves, like the real port: `total_points` is untouched.
    entry.snapshot = { ...entry.snapshot, availablePoints: available };
    return { value: { availablePoints: available } };
  }
  async recordStudentLedgerEntry(entry: { studentId: number; type: string; amount: number; description: string }) {
    this.ledger.push(entry);
  }
  async checkStudentFeature(studentId: number, feature: string) {
    const entry = this.students.get(studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    return this.checkClassFeature(entry.snapshot.classId, feature);
  }
  async checkClassFeature(classId: number, _feature: string) {
    const row = this.classes.get(classId);
    if (!row) return { refusal: { code: 'class-not-found' as const, message: '班级未找到' } };
    if (!row.featureEnabled) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
}

function setup() {
  const repository = new FakeDungeonRepository();
  const classroom = new FakeClassroom();
  classroom.classes.set(3, { id: 3, name: '一班', teacherId: 7, inviteCode: 'ABC', featureEnabled: true });
  classroom.students.set(1, {
    snapshot: { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 200 },
    featureEnabled: true,
  });
  return { repository, classroom, service: new DungeonService(repository, classroom, () => 0.1) };
}

describe('DungeonService', () => {
  let repository: FakeDungeonRepository;
  let classroom: FakeClassroom;
  let service: DungeonService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('starts a new run and ends any existing active run', async () => {
    const first = (await service.startRun(1)).runId;
    const second = (await service.startRun(1)).runId;
    expect(repository.runs.get(first)?.status).toBe('died');
    expect(repository.runs.get(second)?.status).toBe('active');
  });

  it('advances floors and grants a points reward through the port', async () => {
    await service.startRun(1);
    const result = await service.choose(1, { hpCost: 5, rewardType: 'points', rewardValue: 20 });

    expect(result).toMatchObject({ status: 'active', newHp: 95, newFloor: 2 });
    // 200 + 20, moved through the port rather than by writing `students`.
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(220);
    // A dungeon reward is spendable credit, not earned credit: `total_points` stays.
    expect(classroom.students.get(1)?.snapshot.totalPoints).toBe(520);
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'DUNGEON_REWARD', amount: 20, description: 'Found treasure on floor 1' },
    ]);
  });

  it('heals without touching the balance or the ledger', async () => {
    await service.startRun(1);
    const result = await service.choose(1, { hpCost: 50, rewardType: 'heal', rewardValue: 30 });

    expect(result).toMatchObject({ status: 'active', newHp: 80, newFloor: 2 });
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(200);
    expect(classroom.ledger).toHaveLength(0);
  });

  it('stores buffs as JSON and maps them back to an array on read', async () => {
    await service.startRun(1);
    await service.choose(1, { hpCost: 10, rewardType: 'buff', rewardValue: '神秘恩赐: 攻击力+10%' });

    // Stored as text, exactly as the pre-migration repository did.
    expect(repository.getActiveRun(1)?.active_buffs).toBe(JSON.stringify(['神秘恩赐: 攻击力+10%']));

    const state = await service.getRun(1);
    expect(state.run?.active_buffs).toEqual(['神秘恩赐: 攻击力+10%']);
    expect(Array.isArray((state as { choices?: unknown[] }).choices)).toBe(true);
  });

  it('throws 404 when no active run exists', async () => {
    await expect(service.choose(1, { hpCost: 1 })).rejects.toMatchObject({ status: 404, message: 'No active run' });
  });

  it('reports the best floor and no choices once nothing is active', async () => {
    await service.startRun(1);
    await service.choose(1, { hpCost: 5, rewardType: 'points', rewardValue: 20 });
    await service.abandon(1);

    expect(await service.getRun(1)).toMatchObject({ run: null, best_floor: 2 });
  });

  it('abandons the active run', async () => {
    const { runId } = await service.startRun(1);

    expect(await service.abandon(1)).toEqual({ abandoned: true });
    expect(repository.runs.get(runId)?.status).toBe('died');
  });

  it('rejects the whole request when the class has the feature disabled', async () => {
    classroom.classes.get(3)!.featureEnabled = false;

    await expect(service.startRun(1)).rejects.toMatchObject({ status: 403, message: '该功能当前已关闭' });
    // Nothing moved: the gate runs before any write.
    expect(repository.runs.size).toBe(0);
  });

  it('reports a missing student as 404 before the feature gate', async () => {
    await expect(service.getRun(999)).rejects.toMatchObject({ status: 404, message: '学生未找到' });
  });

  /**
   * The pre-migration gate resolved the student's class and then the class row, so a
   * student pointing at a deleted class answered 404 `班级未找到`, not 403. The service
   * keeps that by using `getStudentById` + `checkClassFeature` instead of the
   * single-call `checkStudentFeature`.
   */
  it('reports a student whose class row is gone as 404 班级未找到', async () => {
    classroom.classes.delete(3);

    await expect(service.getRun(1)).rejects.toMatchObject({ status: 404, message: '班级未找到' });
  });

  /**
   * Documented tradeoff, asserted so it cannot change silently: the run transition
   * commits before the credit moves, so a credit refused afterwards loses the reward
   * for that floor (a retry is possible) instead of granting points for a run state
   * that was never persisted (which a retry could farm).
   */
  it('never grants points or writes the ledger when the credit is refused', async () => {
    await service.startRun(1);
    classroom.failCredits = { code: 'student-not-found', message: '学生未找到' };

    await expect(service.choose(1, { hpCost: 5, rewardType: 'points', rewardValue: 20 })).rejects.toMatchObject({
      status: 404,
    });
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(200);
    expect(classroom.ledger).toHaveLength(0);
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so
 * it is worth one test that the plugin's `DbApi` is what it actually reaches for - and
 * that it never touches `students` or `records`.
 */
describe('createDungeonRepository', () => {
  it('touches only the table dungeon declared', () => {
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

    const repository = createDungeonRepository(stub as never);
    repository.getActiveRun(1);
    repository.getBestFloor(1);
    repository.endActiveRuns(1);
    repository.createRun(1);
    repository.updateRun(1, { currentFloor: 2, maxFloor: 2, currentHp: 90, activeBuffs: [], status: 'active' });
    repository.transaction(() => 1);

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    expect([...touched].sort()).toEqual(['dungeon_runs']);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('records');
  });
});
