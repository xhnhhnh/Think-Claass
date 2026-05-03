import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { battlesApi } from '../api/battlesApi';

export const battleKeys = {
  teacher: (classId: number | null) => ['teacher-battles', classId] as const,
  stats: (battleId: number | null) => ['battle-stats', battleId] as const,
};

export function useTeacherBattles(classId: number | null, refetchInterval: number | false = 10000) {
  return useQuery({
    queryKey: battleKeys.teacher(classId),
    queryFn: async () => {
      if (!classId) return [];
      const data = await battlesApi.getTeacherBattles(classId);
      return data.data?.battles ?? data.battles ?? [];
    },
    enabled: !!classId,
    refetchInterval,
  });
}

export function useBattleStats(battleId: number | null, enabled = true, refetchInterval: number | false = 10000) {
  return useQuery({
    queryKey: battleKeys.stats(battleId),
    queryFn: async () => {
      if (!battleId) return null;
      const data = await battlesApi.getBattleStats(battleId);
      return data.data ?? data;
    },
    enabled: enabled && !!battleId,
    refetchInterval: enabled ? refetchInterval : false,
  });
}

export function useInitiateBattleMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: battlesApi.initiateBattle,
    onSuccess: async () => {
      if (classId) await queryClient.invalidateQueries({ queryKey: battleKeys.teacher(classId) });
    },
  });
}

export function useBattleActionMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { battleId: number; action: 'accept' | 'reject' | 'end'; winnerClassId?: number | null }) => {
      if (payload.action === 'accept') return battlesApi.acceptBattle(payload.battleId);
      if (payload.action === 'reject') return battlesApi.rejectBattle(payload.battleId);
      return battlesApi.endBattle(payload.battleId, payload.winnerClassId ?? null);
    },
    onSuccess: async (_data, variables) => {
      if (classId) await queryClient.invalidateQueries({ queryKey: battleKeys.teacher(classId) });
      await queryClient.invalidateQueries({ queryKey: battleKeys.stats(variables.battleId) });
    },
  });
}
