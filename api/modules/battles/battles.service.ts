import { ApiError } from '../../utils/asyncHandler.js';
import { assertClassFeatureEnabled } from '../../utils/classFeatures.js';
import type { BattlesRepository, EndBattlePayload, InitiateBattlePayload } from './battles.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

export class BattlesService {
  constructor(private readonly repository: BattlesRepository) {}

  listBattles(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    assertClassFeatureEnabled(classId, 'enable_class_brawl');
    return this.repository.listBattles(classId);
  }

  initiate(input: InitiateBattlePayload) {
    const initiatorClassId = positiveInteger(input.initiator_class_id, 'Initiator class id');
    const targetClassId = positiveInteger(input.target_class_id, 'Target class id');
    assertClassFeatureEnabled(initiatorClassId, 'enable_class_brawl');
    assertClassFeatureEnabled(targetClassId, 'enable_class_brawl');
    if (this.repository.findActiveBattleForClass(initiatorClassId)) {
      throw new ApiError(400, 'Class is already in a battle');
    }
    return { battleId: this.repository.createBattle({ initiator_class_id: initiatorClassId, target_class_id: targetClassId }) };
  }

  accept(battleIdInput: unknown) {
    const battle = this.getBattleWithFeatureGuard(battleIdInput);
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 15 * 60000);
    this.repository.acceptBattle(battle.id, startTime.toISOString(), endTime.toISOString());
    return { accepted: true };
  }

  reject(battleIdInput: unknown) {
    const battle = this.getBattleWithFeatureGuard(battleIdInput);
    this.repository.rejectBattle(battle.id);
    return { rejected: true };
  }

  end(battleIdInput: unknown, input: EndBattlePayload = {}) {
    const battle = this.getBattleWithFeatureGuard(battleIdInput);
    const winnerClassId = input.winner_class_id ? positiveInteger(input.winner_class_id, 'Winner class id') : null;
    this.repository.endBattle(battle.id, winnerClassId);
    return { ended: true };
  }

  getStats(battleIdInput: unknown) {
    const battle = this.getBattleWithFeatureGuard(battleIdInput);
    let initiatorScore = 0;
    let targetScore = 0;
    if (battle.start_time) {
      initiatorScore = this.repository.sumPointsAfter(battle.initiator_class_id, battle.start_time);
      targetScore = this.repository.sumPointsAfter(battle.target_class_id, battle.start_time);
    }
    return { battle, initiatorScore, targetScore };
  }

  searchClasses(query: unknown, excludeClassIdInput: unknown) {
    const excludeClassId = excludeClassIdInput ? positiveInteger(excludeClassIdInput, 'Exclude class id') : 0;
    if (excludeClassId) {
      assertClassFeatureEnabled(excludeClassId, 'enable_class_brawl');
    }
    return this.repository.searchClasses(query ? String(query) : undefined, excludeClassId);
  }

  private getBattleWithFeatureGuard(battleIdInput: unknown) {
    const battleId = positiveInteger(battleIdInput, 'Battle id');
    const battle = this.repository.getBattle(battleId);
    if (!battle) throw new ApiError(404, 'Battle not found');
    assertClassFeatureEnabled(battle.initiator_class_id, 'enable_class_brawl');
    assertClassFeatureEnabled(battle.target_class_id, 'enable_class_brawl');
    return battle;
  }
}
