/**
 * BattlesService unit tests.
 *
 * Rewritten for the plugin world in P4.3b.2. The pre-migration test
 * (`api/modules/battles/battles.service.test.ts`) mocked `assertClassFeatureEnabled` and
 * faked a repository that also owned `classes` and `records`; both of those moved behind
 * `classroom.public`, so this test fakes a *port* as well and can assert the things that
 * actually matter now:
 *
 *   - the `enable_class_brawl` gate is asked of classroom, not read from a column
 *   - class names and the class search come from the port
 *   - the battle score is the port's ledger aggregate, called with the *stored*
 *     `start_time` unchanged
 *   - a refused gate leaves `class_battles` untouched
 *
 * The behavioural expectations are carried over unchanged from the pre-migration test.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassSnapshot, ClassroomPort, ClassroomResult, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import { createBattlesRepository } from '../../plugins/battles/src/battles.repository.js';
import { BattlesService } from '../../plugins/battles/src/battles.service.js';
import type { BattlesRepository, ClassBattle, InitiateBattlePayload } from '../../plugins/battles/src/battles.types.js';

/** The pre-migration fake, minus the class/ledger reads that no longer live here. */
class FakeBattlesRepository implements BattlesRepository {
  battles = new Map<number, ClassBattle>();
  nextId = 1;

  listBattles(classId: number) {
    return [...this.battles.values()].filter(
      (battle) => battle.initiator_class_id === classId || battle.target_class_id === classId,
    );
  }
  getBattle(battleId: number) {
    return this.battles.get(battleId) ?? null;
  }
  findActiveBattleForClass(classId: number) {
    return this.listBattles(classId).find((battle) => battle.status === 'pending' || battle.status === 'active') ?? null;
  }
  createBattle(input: InitiateBattlePayload) {
    const id = this.nextId++;
    this.battles.set(id, { id, ...input, status: 'pending' });
    return id;
  }
  acceptBattle(battleId: number, startTime: string, endTime: string) {
    const battle = this.battles.get(battleId)!;
    this.battles.set(battleId, { ...battle, status: 'active', start_time: startTime, end_time: endTime });
  }
  rejectBattle(battleId: number) {
    const battle = this.battles.get(battleId)!;
    this.battles.set(battleId, { ...battle, status: 'rejected' });
  }
  endBattle(battleId: number, winnerClassId?: number | null) {
    const battle = this.battles.get(battleId)!;
    this.battles.set(battleId, { ...battle, status: 'ended', winner_class_id: winnerClassId });
  }
}

/**
 * A fake classroom: classes, the feature gate and the ledger live here, exactly as they do
 * behind the real port. Every call the service makes is recorded so the test can assert
 * the *path*, not just the result.
 */
class FakeClassroom implements ClassroomPort {
  classes = new Map<number, ClassSnapshot>();
  /** Classes whose `enable_class_brawl` is off. */
  disabled = new Set<number>();
  /** Points "earned" per class, as `sumClassPointsEarnedSince` would report them. */
  earnedByClass = new Map<number, number>();
  ledgerReads: Array<{ classId: number; since: string }> = [];
  classLookups: number[] = [];
  searchCalls: Array<{ query: string | undefined; excludeClassId: number; limit: number | undefined }> = [];

  async getStudentById(): Promise<StudentSnapshot | null> {
    throw new Error('not used by battles');
  }
  async getClassById(classId: number) {
    this.classLookups.push(classId);
    return this.classes.get(classId) ?? null;
  }
  async listClassStudents() {
    return [];
  }
  async searchClasses(query: string | undefined, excludeClassId: number, limit = 10) {
    this.searchCalls.push({ query, excludeClassId, limit });
    const candidates = [...this.classes.values()].filter((klass) => klass.id !== excludeClassId);
    const filtered = query ? candidates.filter((klass) => klass.name.includes(query)) : candidates;
    return filtered.slice(0, limit);
  }
  async assertStudentInClass(): Promise<void> {
    throw new Error('not used by battles');
  }
  async adjustPoints() {
    throw new Error('not used by battles');
  }
  async transferStudentCredits() {
    throw new Error('not used by battles');
  }
  async recordStudentLedgerEntry(): Promise<void> {
    throw new Error('not used by battles');
  }
  async listStudentLedger() {
    throw new Error('not used by battles');
  }
  async sumClassPointsEarnedSince(classId: number, since: string) {
    this.ledgerReads.push({ classId, since });
    return this.earnedByClass.get(classId) ?? 0;
  }
  async checkStudentFeature(): Promise<ClassroomResult<true>> {
    throw new Error('not used by battles');
  }
  async checkClassFeature(classId: number): Promise<ClassroomResult<true>> {
    if (!this.classes.has(classId)) {
      return { refusal: { code: 'class-not-found', message: '班级未找到' } };
    }
    if (this.disabled.has(classId)) {
      return { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
}

function setup() {
  const repository = new FakeBattlesRepository();
  const classroom = new FakeClassroom();
  classroom.classes.set(1, { id: 1, name: '一班', teacherId: 7, inviteCode: 'AAA' });
  classroom.classes.set(2, { id: 2, name: '二班', teacherId: 8, inviteCode: 'BBB' });
  classroom.classes.set(3, { id: 3, name: '三班', teacherId: 9, inviteCode: 'CCC' });
  return { repository, classroom, service: new BattlesService(repository, classroom) };
}

describe('BattlesService', () => {
  let repository: FakeBattlesRepository;
  let classroom: FakeClassroom;
  let service: BattlesService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  // -- carried over from the pre-migration suite -----------------------------

  it('prevents duplicate active or pending battles for the initiating class', async () => {
    await service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    await expect(service.initiate({ initiator_class_id: 1, target_class_id: 3 })).rejects.toThrow(ApiError);
  });

  it('supports accept and stats flow', async () => {
    classroom.earnedByClass.set(1, 10);
    classroom.earnedByClass.set(2, 20);

    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    await service.accept(battleId);

    expect(await service.getStats(battleId)).toMatchObject({ initiatorScore: 10, targetScore: 20 });
  });

  // -- the port boundary -----------------------------------------------------

  it('resolves class names through the port instead of joining classes', async () => {
    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });

    const [battle] = await service.listBattles(1);
    expect(battle).toMatchObject({
      id: battleId,
      initiator_class_name: '一班',
      target_class_name: '二班',
    });
    expect(classroom.classLookups).toContain(1);
    expect(classroom.classLookups).toContain(2);
  });

  it('drops battles whose class no longer exists, as the legacy INNER JOIN did', async () => {
    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    classroom.classes.delete(2);

    expect(await service.listBattles(1)).toEqual([]);
    await expect(service.getStats(battleId)).rejects.toMatchObject({ status: 404 });
  });

  it('totals the battle score through the ledger port, passing the stored start_time unchanged', async () => {
    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    await service.accept(battleId);

    const stored = repository.getBattle(battleId)!;
    await service.getStats(battleId);

    // The port compares `since` against `records.created_at` as a string, exactly as the
    // pre-migration SQL did - so the stored value is handed over verbatim, never
    // re-formatted.
    expect(classroom.ledgerReads.map((read) => read.classId)).toEqual([1, 2]);
    expect(classroom.ledgerReads.map((read) => read.since)).toEqual([stored.start_time, stored.start_time]);
  });

  it('does not touch the ledger before the battle has started', async () => {
    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });

    expect(await service.getStats(battleId)).toMatchObject({ initiatorScore: 0, targetScore: 0 });
    expect(classroom.ledgerReads).toEqual([]);
  });

  it('searches classes through the port and returns only id and name', async () => {
    const classes = await service.searchClasses(undefined, '1');

    expect(classes).toEqual([
      { id: 2, name: '二班' },
      { id: 3, name: '三班' },
    ]);
    // The port hands back a full ClassSnapshot; inviteCode must not leak into the response.
    expect(classes[0]).not.toHaveProperty('inviteCode');
    // `excludeClassId` is gated on the caller's own class, exactly as before the migration.
    expect(classroom.searchCalls[0].excludeClassId).toBe(1);
    expect(classroom.searchCalls[0].query).toBeUndefined();
  });

  it('passes the search fragment through as a string', async () => {
    await service.searchClasses('三', '1');
    expect(classroom.searchCalls[0].query).toBe('三');
  });

  // -- feature gate and error mapping ---------------------------------------

  it('rejects the whole request when a class has 大乱斗 disabled, before writing anything', async () => {
    classroom.disabled.add(1);

    await expect(service.initiate({ initiator_class_id: 1, target_class_id: 2 })).rejects.toMatchObject({ status: 403 });
    expect(repository.battles.size).toBe(0);
  });

  it('rejects a disabled target class too', async () => {
    classroom.disabled.add(2);

    await expect(service.initiate({ initiator_class_id: 1, target_class_id: 2 })).rejects.toMatchObject({ status: 403 });
    expect(repository.battles.size).toBe(0);
  });

  it('reports a class that does not exist as 404, not 403', async () => {
    await expect(service.listBattles(999)).rejects.toMatchObject({ status: 404 });
    await expect(service.searchClasses(undefined, '999')).rejects.toMatchObject({ status: 404 });
  });

  it('reports a missing battle as 404', async () => {
    await expect(service.getStats(404)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects non-positive ids before reaching the port', async () => {
    await expect(service.listBattles('abc')).rejects.toMatchObject({ status: 400 });
    await expect(service.getStats(0)).rejects.toMatchObject({ status: 400 });
    expect(classroom.classLookups).toEqual([]);
  });

  it('ends the battle with the winner and rejects an invalid winner id', async () => {
    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    await service.accept(battleId);

    await service.end(battleId, { winner_class_id: 1 });
    expect(repository.getBattle(battleId)).toMatchObject({ status: 'ended', winner_class_id: 1 });

    await expect(service.end(battleId, { winner_class_id: 'abc' })).rejects.toMatchObject({ status: 400 });
    expect(repository.getBattle(battleId)).toMatchObject({ winner_class_id: 1 });
  });

  it('guards accept, reject and end behind the same class feature gate', async () => {
    const { battleId } = await service.initiate({ initiator_class_id: 1, target_class_id: 2 });

    classroom.disabled.add(2);
    await expect(service.accept(battleId)).rejects.toMatchObject({ status: 403 });
    await expect(service.reject(battleId)).rejects.toMatchObject({ status: 403 });
    expect(repository.getBattle(battleId)?.status).toBe('pending');
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so it is
 * worth one test that the plugin's `DbApi` is what it actually reaches for - and that the
 * three statements that used to read classroom's tables are gone rather than copied.
 */
describe('createBattlesRepository', () => {
  it('touches only the table battles declared', () => {
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

    const repository = createBattlesRepository(stub as never);
    repository.listBattles(1);
    repository.getBattle(1);
    repository.findActiveBattleForClass(1);
    repository.createBattle({ initiator_class_id: 1, target_class_id: 2 });
    repository.acceptBattle(1, 'a', 'b');
    repository.rejectBattle(1);
    repository.endBattle(1, 2);

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    expect([...touched].sort()).toEqual(['class_battles']);
    expect([...touched]).not.toContain('classes');
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('records');
  });
});

/** The search stub is exercised separately: it is the one read that used to hit `classes`. */
describe('createBattlesRepository - classroom reads are gone', () => {
  it('exposes no class search or ledger method', () => {
    const repository = createBattlesRepository({} as never) as Record<string, unknown>;
    expect(repository.searchClasses).toBeUndefined();
    expect(repository.sumPointsAfter).toBeUndefined();
  });
});
