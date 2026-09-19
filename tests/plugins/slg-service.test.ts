/**
 * SlgService unit tests.
 *
 * Rewritten for the plugin world in P4.3b. The pre-migration test faked an
 * `SlgRepository` that also owned `students` and `records`; both of those moved behind
 * `classroom.public`, so the test now fakes a *port* as well and can assert the thing
 * that actually matters: that the balance and the ledger are reached through the port,
 * and that a refused credit move does not leave a half-applied contribution behind.
 *
 * The behavioural expectations are carried over unchanged from
 * `api/modules/slg/slg.service.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import { createSlgRepository } from '../../plugins/slg/src/slg.repository.js';
import { SlgService } from '../../plugins/slg/src/slg.service.js';
import type {
  ClassResources,
  CreateTerritoryPayload,
  SlgRepository,
  Territory,
  TerritoryStatus,
  TerritoryYield,
} from '../../plugins/slg/src/slg.types.js';

class FakeSlgRepository implements SlgRepository {
  territories = new Map<number, Territory>([
    [
      1,
      {
        id: 1,
        class_id: 3,
        name: '森林',
        type: 'forest',
        status: 'locked',
        level: 1,
        cost_to_unlock: 100,
        current_contribution: 0,
        x_pos: 0,
        y_pos: 0,
      },
    ],
  ]);
  resources = new Map<number, ClassResources>();
  nextId = 2;

  listTerritories(classId: number) {
    return [...this.territories.values()].filter((territory) => territory.class_id === classId);
  }
  getOrCreateResources(classId: number) {
    const existing = this.resources.get(classId);
    if (existing) return existing;
    const created: ClassResources = { class_id: classId, wood: 0, stone: 0, magic_dust: 0, gold: 0 };
    this.resources.set(classId, created);
    return created;
  }
  getTerritory(territoryId: number) {
    return this.territories.get(territoryId) ?? null;
  }
  updateTerritoryContribution(territoryId: number, contribution: number, status: TerritoryStatus) {
    const territory = this.territories.get(territoryId)!;
    this.territories.set(territoryId, { ...territory, current_contribution: contribution, status });
  }
  createTerritory(input: Required<CreateTerritoryPayload>) {
    const id = this.nextId++;
    this.territories.set(id, { id, status: 'locked', level: 1, current_contribution: 0, ...input });
    return id;
  }
  listOwnedTerritoryYields(classId: number) {
    return this.listTerritories(classId)
      .filter((territory) => territory.status === 'owned')
      .map(({ type, level }) => ({ type, level }));
  }
  applyYield(classId: number, yieldInput: TerritoryYield) {
    const resources = this.getOrCreateResources(classId);
    this.resources.set(classId, {
      ...resources,
      wood: resources.wood + yieldInput.wood,
      stone: resources.stone + yieldInput.stone,
      magic_dust: resources.magic_dust + yieldInput.magic_dust,
      gold: resources.gold + yieldInput.gold,
    });
  }
}

/**
 * A fake classroom: the student balance and the ledger live here, exactly as they do
 * behind the real port. `classFeatures` is keyed by class id, so a missing entry means
 * "unknown class" (404) while a `false` entry means "slg switched off" (403).
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): slg never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, StudentSnapshot>();
  classFeatures = new Map<number, boolean>();
  ledger: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  /** Set to make `transferStudentCredits` refuse, for compensation tests. */
  failCredits: ClassroomRefusal | null = null;

  async getStudentById(studentId: number) {
    return this.students.get(studentId) ?? null;
  }
  async getClassById(classId: number) {
    return this.classFeatures.has(classId)
      ? { id: classId, name: '一班', teacherId: 7, inviteCode: 'ABC' }
      : null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()].filter((student) => student.classId === classId);
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const student = this.students.get(studentId);
    if (!student || student.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints() {
    throw new Error('not used by slg');
  }
  async transferStudentCredits(input: { studentId: number; delta: number }) {
    if (this.failCredits) return { refusal: this.failCredits };
    const student = this.students.get(input.studentId);
    if (!student) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    const availablePoints = student.availablePoints + input.delta;
    if (availablePoints < 0) {
      return { refusal: { code: 'insufficient-credits' as const, message: '积分不足' } };
    }
    this.students.set(input.studentId, { ...student, availablePoints });
    return { value: { availablePoints } };
  }
  async recordStudentLedgerEntry(entry: { studentId: number; type: string; amount: number; description: string }) {
    this.ledger.push(entry);
  }
  async checkStudentFeature(studentId: number) {
    const student = this.students.get(studentId);
    if (!student) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    if (!this.classFeatures.get(student.classId)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
  async checkClassFeature(classId: number) {
    if (!this.classFeatures.has(classId)) {
      return { refusal: { code: 'class-not-found' as const, message: '班级未找到' } };
    }
    if (!this.classFeatures.get(classId)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
}

function setup() {
  const repository = new FakeSlgRepository();
  const classroom = new FakeClassroom();
  classroom.students.set(1, { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 500 });
  classroom.classFeatures.set(3, true);
  return { repository, classroom, service: new SlgService(repository, classroom) };
}

describe('SlgService', () => {
  let repository: FakeSlgRepository;
  let classroom: FakeClassroom;
  let service: SlgService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('deducts points and unlocks territory when contribution reaches the cost', async () => {
    await service.contribute(1, 1, { amount: 100 });

    expect(classroom.students.get(1)?.availablePoints).toBe(400);
    expect(repository.territories.get(1)?.status).toBe('owned');
    expect(repository.territories.get(1)?.current_contribution).toBe(100);
  });

  it('marks a partly funded territory as unlocking', async () => {
    await service.contribute(1, 1, { amount: 40 });

    expect(repository.territories.get(1)?.status).toBe('unlocking');
    expect(classroom.students.get(1)?.availablePoints).toBe(460);
  });

  it('rejects contributions above available points', async () => {
    await expect(service.contribute(1, 1, { amount: 600 })).rejects.toThrow(ApiError);
    // Nothing moved: the balance check runs before any write.
    expect(classroom.students.get(1)?.availablePoints).toBe(500);
    expect(repository.territories.get(1)?.current_contribution).toBe(0);
  });

  it('creates territory and yields resources for owned territory', async () => {
    const { territoryId } = await service.createTerritory({
      class_id: 3,
      name: '矿洞',
      type: 'mine',
      cost_to_unlock: 100,
      x_pos: 1,
      y_pos: 1,
    });
    repository.updateTerritoryContribution(territoryId, 100, 'owned');

    const result = await service.yieldResources(3);
    expect(result.yield.stone).toBe(10);
    expect(repository.resources.get(3)?.stone).toBe(10);
  });

  it('creates the resource row even when no territory is owned', async () => {
    const result = await service.yieldResources(3);

    expect(result.yield).toEqual({ wood: 0, stone: 0, magic_dust: 0, gold: 0 });
    expect(repository.resources.has(3)).toBe(true);
  });

  it('appends the contribution to the shared ledger through the port', async () => {
    await service.contribute(1, 1, { amount: 30 });

    expect(classroom.ledger).toHaveLength(1);
    expect(classroom.ledger[0]).toEqual({
      studentId: 1,
      type: 'SLG_CONTRIBUTE',
      amount: -30,
      description: 'Contributed to territory: 森林',
    });
  });

  it('reports a missing student as 404 before the feature gate', async () => {
    await expect(service.contribute(999, 1, { amount: 10 })).rejects.toMatchObject({ status: 404 });
  });

  it('rejects an unknown class as 404', async () => {
    await expect(service.getMap(9)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects the whole operation when the class has slg disabled', async () => {
    classroom.classFeatures.set(3, false);

    await expect(service.getMap(3)).rejects.toMatchObject({ status: 403 });
    await expect(service.contribute(1, 1, { amount: 10 })).rejects.toMatchObject({ status: 403 });
    // Nothing moved: the gate runs before any territory or balance write.
    expect(classroom.students.get(1)?.availablePoints).toBe(500);
    expect(repository.territories.get(1)?.current_contribution).toBe(0);
  });

  it('rejects a contribution to an already-owned territory', async () => {
    repository.updateTerritoryContribution(1, 100, 'owned');

    await expect(service.contribute(1, 1, { amount: 10 })).rejects.toThrow(ApiError);
    expect(classroom.students.get(1)?.availablePoints).toBe(500);
  });

  it('rejects contributions to a territory that does not exist', async () => {
    await expect(service.contribute(1, 77, { amount: 10 })).rejects.toMatchObject({ status: 404 });
  });

  /**
   * The interesting failure: the plugin-owned territory row is written first, then the
   * port moves the balance. If the port refuses, the territory write must be undone, or
   * the map would show a contribution the student never paid for.
   */
  it('restores the territory when the credit transfer is refused', async () => {
    classroom.failCredits = { code: 'insufficient-credits', message: '积分不足' };

    await expect(service.contribute(1, 1, { amount: 40 })).rejects.toThrow(ApiError);

    expect(repository.territories.get(1)?.current_contribution).toBe(0);
    expect(repository.territories.get(1)?.status).toBe('locked');
    expect(classroom.students.get(1)?.availablePoints).toBe(500);
    expect(classroom.ledger).toHaveLength(0);
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so it
 * is worth one test that the plugin's `DbApi` is what it actually reaches for - and that
 * it never touches `students` or `records`.
 */
describe('createSlgRepository', () => {
  it('touches only tables slg declared', () => {
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

    const repository = createSlgRepository(stub as never);
    repository.listTerritories(3);
    repository.getOrCreateResources(3);
    repository.getTerritory(1);
    repository.createTerritory({ class_id: 3, name: '森林', type: 'forest', cost_to_unlock: 100, x_pos: 0, y_pos: 0 });
    repository.updateTerritoryContribution(1, 10, 'unlocking');
    repository.listOwnedTerritoryYields(3);
    repository.applyYield(3, { wood: 1, stone: 0, magic_dust: 0, gold: 0 });

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    expect([...touched].sort()).toEqual(['class_resources', 'territories']);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('records');
  });
});
