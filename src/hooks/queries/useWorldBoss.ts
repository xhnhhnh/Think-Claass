import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { challengeApi } from '@/api/challenge';

export function useWorldBosses() {
  return useQuery({
    queryKey: ['world-bosses'],
    queryFn: async () => {
      const data = await challengeApi.getWorldBosses();
      return data.bosses;
    },
  });
}

export function useWorldBossMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: 'create'; data: any } | { type: 'delete'; id: number }) => {
      if (payload.type === 'create') return challengeApi.createWorldBoss(payload.data);
      return challengeApi.deleteWorldBoss(payload.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['world-bosses'] });
    },
  });
}
