import type { BattleClassSummary, BattleStats, ClassBattle, EndBattlePayload, InitiateBattlePayload } from '../../../src/shared/battles/contracts.js';

export interface BattlesRepository {
  listBattles(classId: number): ClassBattle[];
  getBattle(battleId: number): ClassBattle | null;
  findActiveBattleForClass(classId: number): ClassBattle | null;
  createBattle(input: InitiateBattlePayload): number;
  acceptBattle(battleId: number, startTime: string, endTime: string): void;
  rejectBattle(battleId: number): void;
  endBattle(battleId: number, winnerClassId?: number | null): void;
  sumPointsAfter(classId: number, startTime: string): number;
  searchClasses(query: string | undefined, excludeClassId: number): BattleClassSummary[];
}

export type { BattleClassSummary, BattleStats, ClassBattle, EndBattlePayload, InitiateBattlePayload };
