/**
 * gacha domain contracts.
 *
 * Moved from `src/shared/gacha/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { ApiSuccess } from '@thinkclass/contracts';

export type GachaRarity = 'SSR' | 'SR' | 'R' | 'N';

export interface PetDictionaryEntry {
  id: number;
  name: string;
  element: string;
  rarity: GachaRarity;
  base_power: number;
  description?: string;
}

export interface GachaPool {
  id: number;
  class_id: number;
  name: string;
  cost_points: number;
  ssr_rate: number;
  sr_rate: number;
  r_rate: number;
  n_rate: number;
  is_active: number;
}

export interface PetCollectionItem extends PetDictionaryEntry {
  instance_id: number;
  level: number;
  experience: number;
  is_active: number;
}

export interface CreatePetDictionaryPayload {
  name: string;
  element: string;
  rarity: GachaRarity;
  base_power: number;
  description?: string;
}

export interface GachaDrawPayload {
  poolId: number;
  times: number;
}

export type GachaDictionaryResponse = ApiSuccess<{ pets: PetDictionaryEntry[] }>;
export type GachaPoolsResponse = ApiSuccess<{ pools: GachaPool[] }>;
export type GachaDrawResponse = ApiSuccess<{ results: PetDictionaryEntry[] }>;
export type GachaCollectionResponse = ApiSuccess<{ collection: PetCollectionItem[] }>;
