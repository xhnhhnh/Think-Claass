import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/classFeatures.js', () => ({
  assertClassFeatureEnabled: vi.fn(),
}));

import { ApiError } from '../../utils/asyncHandler';
import { BattlesService } from './battles.service';
import type { BattleClassSummary, BattlesRepository, ClassBattle, InitiateBattlePayload } from './battles.types';

class FakeBattlesRepository implements BattlesRepository {
  battles = new Map<number, ClassBattle>();
  nextId = 1;

  listBattles(classId: number) { return [...this.battles.values()].filter((battle) => battle.initiator_class_id === classId || battle.target_class_id === classId); }
  getBattle(battleId: number) { return this.battles.get(battleId) ?? null; }
  findActiveBattleForClass(classId: number) {
    return this.listBattles(classId).find((battle) => battle.status === 'pending' || battle.status === 'active') ?? null;
  }
  createBattle(input: InitiateBattlePayload) {
    const id = this.nextId++;
    this.battles.set(id, { id, ...input, status: 'pending', initiator_class_name: 'A', target_class_name: 'B' });
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
  sumPointsAfter(classId: number) { return classId * 10; }
  searchClasses(_query: string | undefined, excludeClassId: number): BattleClassSummary[] { return [{ id: excludeClassId + 1, name: 'B' }]; }
}

describe('BattlesService', () => {
  let service: BattlesService;

  beforeEach(() => {
    service = new BattlesService(new FakeBattlesRepository());
  });

  it('prevents duplicate active or pending battles for the initiating class', () => {
    service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    expect(() => service.initiate({ initiator_class_id: 1, target_class_id: 3 })).toThrow(ApiError);
  });

  it('supports accept and stats flow', () => {
    const { battleId } = service.initiate({ initiator_class_id: 1, target_class_id: 2 });
    service.accept(battleId);
    expect(service.getStats(battleId)).toMatchObject({ initiatorScore: 10, targetScore: 20 });
  });
});
