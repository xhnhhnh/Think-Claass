import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { slgApi, type CreateTerritoryPayload } from '../api/slgApi';

export const territoryKeys = {
  map: (classId: number | null) => ['territory-map', classId] as const,
};

export function useTerritoryMap(classId: number | null, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: territoryKeys.map(classId),
    queryFn: async () => {
      if (!classId) return { territories: [], resources: null };
      const data = await slgApi.getMap(classId);
      return data.data ?? { territories: data.territories, resources: data.resources };
    },
    enabled: !!classId,
    refetchInterval,
  });
}

export function useContributeTerritoryMutation(classId: number | null, studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { territoryId: number; amount: number }) => {
      if (!studentId) throw new Error('学生信息不存在');
      return slgApi.contribute(studentId, payload.territoryId, { amount: payload.amount });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: territoryKeys.map(classId) });
    },
  });
}

export function useCreateTerritoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTerritoryPayload) => slgApi.createTerritory(payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: territoryKeys.map(variables.class_id) });
    },
  });
}

export function useTriggerYieldMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classId: number) => slgApi.triggerYield(classId),
    onSuccess: async (_data, classId) => {
      await queryClient.invalidateQueries({ queryKey: territoryKeys.map(classId) });
    },
  });
}
