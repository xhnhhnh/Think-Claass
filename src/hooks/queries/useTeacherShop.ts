import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { shopApi } from '@/api/shop';

export function useTeacherShopItems() {
  return useQuery({
    queryKey: ['teacher-shop-items'],
    queryFn: async () => {
      const data = await shopApi.getAllItems();
      return data.items;
    },
  });
}

export function useTeacherShopMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload:
        | { type: 'status'; itemId: number; isActive: number }
        | { type: 'update'; itemId: number; data: Record<string, unknown> }
        | { type: 'create'; data: Record<string, unknown> },
    ) => {
      if (payload.type === 'status') return shopApi.updateStatus(payload.itemId, payload.isActive);
      if (payload.type === 'update') return shopApi.updateItem(payload.itemId, payload.data);
      return shopApi.createItem(payload.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teacher-shop-items'] });
      await queryClient.invalidateQueries({ queryKey: ['student-shop-data'] });
    },
  });
}
