import { useMutation, useQuery } from '@tanstack/react-query';

import { slgApi, type CreateTerritoryPayload } from '@/api/slg';

export function useTerritoryMap(classId: number | null) {
  return useQuery({
    queryKey: ['territory-map', classId],
    queryFn: async () => {
      if (!classId) return { territories: [], resources: null };
      const data = await slgApi.getMap(classId);
      return { territories: data.territories, resources: data.resources };
    },
    enabled: !!classId,
  });
}

export function useCreateTerritoryMutation() {
  return useMutation({
    mutationFn: (payload: CreateTerritoryPayload) => slgApi.createTerritory(payload),
  });
}

export function useTriggerYieldMutation() {
  return useMutation({
    mutationFn: (classId: number) => slgApi.triggerYield(classId),
  });
}
