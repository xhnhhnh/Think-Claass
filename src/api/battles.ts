import { apiGet, apiPost, apiPut } from '@/lib/api';

export interface Battle {
  id: number;
  initiator_class_id: number;
  target_class_id: number;
  initiator_class_name: string;
  target_class_name: string;
  status: 'pending' | 'active' | 'ended' | 'rejected';
  start_time: string | null;
  end_time: string | null;
  winner_class_id: number | null;
}

export interface BattleStats {
  success: true;
  battle: Battle;
  initiatorScore: number;
  targetScore: number;
}

export interface BattleClassLite {
  id: number;
  name: string;
}

export const battlesApi = {
  getTeacherBattles: (classId: number) =>
    apiGet<{ success: true; battles: Battle[] }>(`/api/battles/teacher/${classId}`),

  searchClasses: (query: string, excludeClassId: number) =>
    apiGet<{ success: true; classes: BattleClassLite[] }>(
      `/api/battles/classes/search?q=${encodeURIComponent(query)}&excludeClassId=${excludeClassId}`,
    ),

  initiateBattle: (payload: { initiator_class_id: number; target_class_id: number }) =>
    apiPost<{ success: true; battleId: number }>('/api/battles/teacher/initiate', payload),

  acceptBattle: (battleId: number) => apiPut<{ success: true }>(`/api/battles/teacher/accept/${battleId}`),

  rejectBattle: (battleId: number) => apiPut<{ success: true }>(`/api/battles/teacher/reject/${battleId}`),

  endBattle: (battleId: number, winner_class_id: number | null) =>
    apiPut<{ success: true }>(`/api/battles/teacher/end/${battleId}`, { winner_class_id }),

  getBattleStats: (battleId: number) => apiGet<BattleStats>(`/api/battles/stats/${battleId}`),
};
