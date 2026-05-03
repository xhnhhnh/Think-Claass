import type { ApiSuccess } from '../core/contracts';

export type DungeonRunStatus = 'active' | 'died' | 'completed';
export type DungeonChoiceType = 'combat' | 'event' | 'treasure' | 'rest';
export type DungeonRewardType = 'points' | 'heal' | 'buff';

export interface DungeonRun {
  id: number;
  student_id: number;
  current_floor: number;
  max_floor: number;
  active_buffs: string[];
  current_hp: number;
  max_hp: number;
  status: DungeonRunStatus;
  created_at?: string;
  updated_at?: string;
}

export interface FloorChoice {
  id: string;
  title: string;
  description: string;
  type: DungeonChoiceType;
  hpCost: number;
  rewardType: DungeonRewardType;
  rewardValue: number | string;
}

export interface DungeonState {
  run: DungeonRun | null;
  choices?: FloorChoice[];
  best_floor?: number;
}

export interface DungeonChoicePayload {
  choiceType?: DungeonChoiceType;
  hpCost?: number;
  rewardType?: DungeonRewardType;
  rewardValue?: number | string;
}

export interface DungeonChoiceResult {
  status: DungeonRunStatus;
  newHp: number;
  newFloor: number;
}

export type DungeonStateResponse = ApiSuccess<DungeonState>;
export type DungeonChoiceResponse = ApiSuccess<DungeonChoiceResult>;
