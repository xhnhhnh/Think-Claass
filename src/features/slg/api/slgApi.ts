import { apiGet, apiPost } from '@/lib/api';
import type { CreateTerritoryPayload, TerritoryContributionPayload, TerritoryMapResponse } from '@/shared/slg/contracts';

export const slgApi = {
  getMap: (classId: number) => apiGet<TerritoryMapResponse & TerritoryMapResponse['data']>(`/api/slg/classes/${classId}/map`),
  contribute: (studentId: number, territoryId: number, payload: TerritoryContributionPayload) =>
    apiPost<{ success: true }>(`/api/slg/students/${studentId}/territories/${territoryId}/contributions`, payload),
  createTerritory: (payload: CreateTerritoryPayload) =>
    apiPost<{ success: true }>(`/api/slg/classes/${payload.class_id}/territories`, payload),
  triggerYield: (classId: number) => apiPost<{ success: true }>(`/api/slg/classes/${classId}/yield`),
};

export type { ClassResources, CreateTerritoryPayload, Territory, TerritoryContributionPayload, TerritoryType } from '@/shared/slg/contracts';
