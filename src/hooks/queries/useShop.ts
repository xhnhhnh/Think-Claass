import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { shopApi } from '@/api/shop';

export function useStudentShopData(studentId: number | null) {
  return useQuery({
    queryKey: ['student-shop-data', studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const [itemsData, boxesData] = await Promise.all([shopApi.getStudentItems(), shopApi.getBlindBoxes()]);
      return {
        items: itemsData.items,
        boxes: boxesData.boxes,
      };
    },
    enabled: !!studentId,
  });
}

export function useBuyShopItemMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: number) => {
      if (!studentId) throw new Error('学生信息不存在');
      return shopApi.buyItem({ studentId, itemId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-shop-data', studentId] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useBuyBlindBoxMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blindBoxId: number) => {
      if (!studentId) throw new Error('学生信息不存在');
      return shopApi.buyBlindBox({ studentId, blindBoxId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-shop-data', studentId] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}
