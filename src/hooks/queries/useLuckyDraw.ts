import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { luckyDrawApi } from '@/api/luckyDraw';

export function useLuckyDrawConfig(teacherId: number | null) {
  return useQuery({
    queryKey: ['lucky-draw-config', teacherId],
    queryFn: async () => {
      if (!teacherId) return { configs: [], cost_points: 10 };
      return luckyDrawApi.getConfig(teacherId);
    },
    enabled: !!teacherId,
  });
}

export function useSaveLuckyDrawConfigMutation(teacherId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: luckyDrawApi.saveConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lucky-draw-config', teacherId] });
    },
  });
}

export function useLuckyDrawMutation(studentId: number | null) {
  return useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error('学生信息不存在');
      return luckyDrawApi.draw(studentId);
    },
  });
}
