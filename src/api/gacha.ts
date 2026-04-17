import { apiGet, apiPost, apiPut } from '@/lib/api';

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

export interface GachaPetResult {
  id: number;
  name: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  element: string;
}

export interface StudentPetCollectionItem {
  instance_id: number;
  level: number;
  experience: number;
  is_active: number;
  id: number;
  name: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  element: string;
  base_power: number;
  description: string;
}

export const gachaApi = {
  getPools: (classId: number) =>
    apiGet<{ success: true; pools: GachaPool[] }>(`/api/gacha/pools/${classId}`),

  draw: (studentId: number, payload: { poolId: number; times: number }) =>
    apiPost<{ success: true; results: GachaPetResult[] }>(`/api/gacha/draw/${studentId}`, payload),

  getCollection: (studentId: number) =>
    apiGet<{ success: true; collection: StudentPetCollectionItem[] }>(`/api/gacha/collection/${studentId}`),

  setActivePet: (studentId: number, instanceId: number) =>
    apiPut<{ success: true }>(`/api/gacha/active/${studentId}/${instanceId}`),
};
