import { useMutation, useQuery } from '@tanstack/react-query';

import { gachaApi } from '@/api/gacha';

export function useGachaPools(classId: number | null) {
  return useQuery({
    queryKey: ['gacha-pools', classId],
    queryFn: async () => {
      if (!classId) return [];
      const data = await gachaApi.getPools(classId);
      return data.pools;
    },
    enabled: !!classId,
  });
}

export function useGachaDrawMutation(studentId: number | null) {
  return useMutation({
    mutationFn: async (payload: { poolId: number; times: number }) => {
      if (!studentId) {
        throw new Error('学生信息不存在');
      }
      return gachaApi.draw(studentId, payload);
    },
  });
}
