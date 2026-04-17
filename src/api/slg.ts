import { apiGet, apiPost } from '@/lib/api';

export interface Territory {
  id: number;
  class_id: number;
  name: string;
  type: 'forest' | 'mine' | 'city' | 'magic_spring';
  level: number;
  cost_to_unlock: number;
  current_contribution: number;
  x_pos: number;
  y_pos: number;
  status: 'locked' | 'unlocking' | 'owned';
}

export interface ClassResources {
  class_id: number;
  wood: number;
  stone: number;
  magic_dust: number;
  gold: number;
}

export interface CreateTerritoryPayload {
  class_id: number;
  name: string;
  type: 'forest' | 'mine' | 'city' | 'magic_spring';
  cost_to_unlock: number;
  x_pos: number;
  y_pos: number;
}

export const slgApi = {
  getMap: (classId: number) =>
    apiGet<{ success: true; territories: Territory[]; resources: ClassResources }>(`/api/slg/map/${classId}`),

  createTerritory: (payload: CreateTerritoryPayload) =>
    apiPost<{ success: true }>('/api/slg/teacher', payload),

  triggerYield: (classId: number) => apiPost<{ success: true }>(`/api/slg/teacher/yield/${classId}`),
};
