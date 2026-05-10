import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/classFeatures.js', () => ({
  assertStudentFeatureEnabled: vi.fn(),
}));

import { ApiError } from '../../utils/asyncHandler';
import { DungeonService } from './dungeon.service';
import type { DungeonRepository, DungeonRunRow } from './dungeon.types';

class FakeDungeonRepository implements DungeonRepository {
  runs = new Map<number, DungeonRunRow>();
  records: Array<{ studentId: number; amount: number }> = [];
  nextId = 1;

  transaction<T>(fn: () => T): T { return fn(); }
  getActiveRun(studentId: number) { return [...this.runs.values()].find((run) => run.student_id === studentId && run.status === 'active') ?? null; }
  getBestFloor(studentId: number) { return Math.max(0, ...[...this.runs.values()].filter((run) => run.student_id === studentId).map((run) => run.max_floor)); }
  endActiveRuns(studentId: number) {
    for (const [id, run] of this.runs) if (run.student_id === studentId && run.status === 'active') this.runs.set(id, { ...run, status: 'died' });
  }
  createRun(studentId: number) {
    const id = this.nextId++;
    this.runs.set(id, { id, student_id: studentId, current_floor: 1, max_floor: 1, active_buffs: '[]', current_hp: 100, max_hp: 100, status: 'active' });
    return id;
  }
  updateRun(runId: number, input: { currentFloor: number; maxFloor: number; currentHp: number; activeBuffs: string[]; status: string }) {
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
  addStudentPoints() {}
  insertRecord(studentId: number, _type: string, amount: number) { this.records.push({ studentId, amount }); }
}

describe('DungeonService', () => {
  let repository: FakeDungeonRepository;
  let service: DungeonService;

  beforeEach(() => {
    repository = new FakeDungeonRepository();
    service = new DungeonService(repository, () => 0.1);
  });

  it('starts a new run and ends any existing active run', () => {
    const first = service.startRun(1).runId;
    const second = service.startRun(1).runId;
    expect(repository.runs.get(first)?.status).toBe('died');
    expect(repository.runs.get(second)?.status).toBe('active');
  });

  it('advances floors and records point rewards', () => {
    service.startRun(1);
    const result = service.choose(1, { hpCost: 5, rewardType: 'points', rewardValue: 20 });
    expect(result).toMatchObject({ status: 'active', newHp: 95, newFloor: 2 });
    expect(repository.records).toEqual([{ studentId: 1, amount: 20 }]);
  });

  it('throws when no active run exists', () => {
    expect(() => service.choose(1, { hpCost: 1 })).toThrow(ApiError);
  });
});
