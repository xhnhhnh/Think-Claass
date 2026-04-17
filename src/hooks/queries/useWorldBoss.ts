import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPost } from '@/lib/api';

export function useWorldBosses() {
  return useQuery({
    queryKey: ['world-bosses'],
    queryFn: async () => {
      const data = await apiGet<{ success: true; bosses: any[] }>('/api/challenge/boss');
      return data.bosses;
    },
  });
}

export function useWorldBossMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: 'create'; data: any } | { type: 'delete'; id: number }) => {
      if (payload.type === 'create') return apiPost('/api/challenge/boss', payload.data);
      return apiDelete(`/api/challenge/boss/${payload.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['world-bosses'] });
    },
  });
}
