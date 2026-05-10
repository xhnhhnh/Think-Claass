import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dungeonApi, type DungeonChoicePayload } from '../api/dungeonApi';

export const dungeonKeys = {
  run: (studentId: number | null) => ['dungeon-run', studentId] as const,
};

export function useDungeonRun(studentId: number | null) {
  return useQuery({
    queryKey: dungeonKeys.run(studentId),
    queryFn: async () => {
      if (!studentId) return { run: null, best_floor: 0 };
      const response = await dungeonApi.getRun(studentId);
      return response.data;
    },
    enabled: !!studentId,
  });
}

export function useDungeonActionMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { action: 'start' } | { action: 'choice'; choice: DungeonChoicePayload } | { action: 'abandon' }) => {
      if (!studentId) throw new Error('学生信息不存在');
      if (payload.action === 'start') return dungeonApi.start(studentId);
      if (payload.action === 'abandon') return dungeonApi.abandon(studentId);
      return dungeonApi.choose(studentId, payload.choice);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dungeonKeys.run(studentId) });
    },
  });
}
