import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { gachaApi, type GachaDrawPayload } from '../api/gachaApi';

export const gachaKeys = {
  pools: (classId: number | null) => ['gacha-pools', classId] as const,
  collection: (studentId: number | null) => ['gacha-collection', studentId] as const,
};

export function useGachaPools(classId: number | null) {
  return useQuery({
    queryKey: gachaKeys.pools(classId),
    queryFn: async () => {
      if (!classId) return [];
      const data = await gachaApi.getPools(classId);
      return data.data?.pools ?? data.pools ?? [];
    },
    enabled: !!classId,
  });
}

export function useGachaCollection(studentId: number | null) {
  return useQuery({
    queryKey: gachaKeys.collection(studentId),
    queryFn: async () => {
      if (!studentId) return [];
      const data = await gachaApi.getCollection(studentId);
      return data.data?.collection ?? data.collection ?? [];
    },
    enabled: !!studentId,
  });
}

export function useGachaDrawMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GachaDrawPayload) => {
      if (!studentId) throw new Error('学生信息不存在');
      return gachaApi.draw(studentId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gachaKeys.collection(studentId) });
    },
  });
}

export function useSetActivePetMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: number) => {
      if (!studentId) throw new Error('学生信息不存在');
      return gachaApi.setActivePet(studentId, instanceId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gachaKeys.collection(studentId) });
    },
  });
}
