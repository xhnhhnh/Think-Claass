import type { ApiSuccess } from '../core/contracts';

export type ClassBattleStatus = 'pending' | 'active' | 'rejected' | 'ended';

export interface ClassBattle {
  id: number;
  initiator_class_id: number;
  target_class_id: number;
  status: ClassBattleStatus;
  start_time?: string | null;
  end_time?: string | null;
  winner_class_id?: number | null;
  initiator_class_name?: string;
  target_class_name?: string;
}

export interface BattleStats {
  battle: ClassBattle;
  initiatorScore: number;
  targetScore: number;
}

export interface BattleClassSummary {
  id: number;
  name: string;
}

export interface InitiateBattlePayload {
  initiator_class_id: number;
  target_class_id: number;
}

export interface EndBattlePayload {
  winner_class_id?: number | null;
}

export type ClassBattlesResponse = ApiSuccess<{ battles: ClassBattle[] }>;
export type BattleStatsResponse = ApiSuccess<BattleStats>;
export type BattleClassesResponse = ApiSuccess<{ classes: BattleClassSummary[] }>;
