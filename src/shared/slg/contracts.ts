import type { ApiSuccess } from '../core/contracts';

export type TerritoryStatus = 'locked' | 'unlocking' | 'owned';
export type TerritoryType = 'forest' | 'mine' | 'magic_spring' | 'city';

export interface Territory {
  id: number;
  class_id: number;
  name: string;
  type: TerritoryType;
  status: TerritoryStatus;
  level: number;
  cost_to_unlock: number;
  current_contribution: number;
  x_pos: number;
  y_pos: number;
}

export interface ClassResources {
  id?: number;
  class_id: number;
  wood: number;
  stone: number;
  magic_dust: number;
  gold: number;
}

export interface TerritoryMap {
  territories: Territory[];
  resources: ClassResources;
}

export interface TerritoryContributionPayload {
  amount: number;
}

export interface CreateTerritoryPayload {
  class_id: number;
  name: string;
  type: TerritoryType;
  cost_to_unlock?: number;
  x_pos?: number;
  y_pos?: number;
}

export type TerritoryMapResponse = ApiSuccess<TerritoryMap>;
