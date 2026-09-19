/**
 * battles domain types.
 *
 * The DTOs stay in `@thinkclass/contracts` (they are the HTTP contract the frontend
 * reads); this file only adds the storage boundary.
 *
 * Note what is NOT in `BattlesRepository` any more, because each one read a table
 * classroom owns:
 *
 *   - the `JOIN classes` that attached `initiator_class_name` / `target_class_name`
 *     -> `classroom.public.getClassById`
 *   - `sumPointsAfter` (`SELECT SUM(amount) FROM records JOIN students`)
 *     -> `classroom.public.sumClassPointsEarnedSince`
 *   - `searchClasses` (`SELECT id, name FROM classes WHERE name LIKE ?`)
 *     -> `classroom.public.searchClasses`
 *
 * What is left is the one table battles actually owns: `class_battles`.
 */

import type {
  BattleClassSummary,
  BattleStats,
  ClassBattle,
  EndBattlePayload,
  InitiateBattlePayload,
} from '@thinkclass/contracts/domains/battles';

export interface BattlesRepository {
  listBattles(classId: number): ClassBattle[];
  getBattle(battleId: number): ClassBattle | null;
  findActiveBattleForClass(classId: number): ClassBattle | null;
  createBattle(input: InitiateBattlePayload): number;
  acceptBattle(battleId: number, startTime: string, endTime: string): void;
  rejectBattle(battleId: number): void;
  endBattle(battleId: number, winnerClassId?: number | null): void;
}

export type { BattleClassSummary, BattleStats, ClassBattle, EndBattlePayload, InitiateBattlePayload };
