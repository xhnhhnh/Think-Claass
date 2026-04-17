import { useMutation, useQuery } from '@tanstack/react-query';

import { battlesApi } from '@/api/battles';

export function useTeacherBattles(classId: number | null) {
  return useQuery({
    queryKey: ['teacher-battles', classId],
    queryFn: async () => {
      if (!classId) return [];
      const data = await battlesApi.getTeacherBattles(classId);
      return data.battles;
    },
    enabled: !!classId,
    refetchInterval: 10000,
  });
}

export function useBattleStats(battleId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['battle-stats', battleId],
    queryFn: async () => {
      if (!battleId) return null;
      return battlesApi.getBattleStats(battleId);
    },
    enabled: enabled && !!battleId,
    refetchInterval: enabled ? 10000 : false,
  });
}

export function useInitiateBattleMutation() {
  return useMutation({
    mutationFn: battlesApi.initiateBattle,
  });
}

export function useBattleActionMutation() {
  return useMutation({
    mutationFn: async (payload: { battleId: number; action: 'accept' | 'reject' | 'end'; winnerClassId?: number | null }) => {
      if (payload.action === 'accept') {
        return battlesApi.acceptBattle(payload.battleId);
      }
      if (payload.action === 'reject') {
        return battlesApi.rejectBattle(payload.battleId);
      }
      return battlesApi.endBattle(payload.battleId, payload.winnerClassId ?? null);
    },
  });
}
