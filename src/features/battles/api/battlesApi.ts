import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  BattleClassesResponse,
  BattleStatsResponse,
  ClassBattlesResponse,
  EndBattlePayload,
  InitiateBattlePayload,
} from '@/shared/battles/contracts';

export const battlesApi = {
  getTeacherBattles: (classId: number) =>
    apiGet<ClassBattlesResponse & { battles?: ClassBattlesResponse['data']['battles'] }>(`/api/battles/classes/${classId}`),
  searchClasses: (query: string, excludeClassId: number) =>
    apiGet<BattleClassesResponse & { classes?: BattleClassesResponse['data']['classes'] }>(
      `/api/battles/classes/search?q=${encodeURIComponent(query)}&excludeClassId=${excludeClassId}`,
    ),
  initiateBattle: (payload: InitiateBattlePayload) =>
    apiPost<{ success: true; data: { battleId: number }; battleId: number }>('/api/battles', payload),
  acceptBattle: (battleId: number) => apiPut<{ success: true }>(`/api/battles/${battleId}/accept`),
  rejectBattle: (battleId: number) => apiPut<{ success: true }>(`/api/battles/${battleId}/reject`),
  endBattle: (battleId: number, winner_class_id: EndBattlePayload['winner_class_id']) =>
    apiPut<{ success: true }>(`/api/battles/${battleId}/end`, { winner_class_id }),
  getBattleStats: (battleId: number) => apiGet<BattleStatsResponse & BattleStatsResponse['data']>(`/api/battles/${battleId}/stats`),
};

export type { BattleClassSummary as BattleClassLite, BattleStats, ClassBattle as Battle } from '@/shared/battles/contracts';
