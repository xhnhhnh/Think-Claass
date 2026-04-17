import { useMutation, useQuery } from '@tanstack/react-query';

import { taskTreeApi, type TaskNodePayload } from '@/api/taskTree';

export function useTeacherTaskNodes(classId: number | null) {
  return useQuery({
    queryKey: ['teacher-task-nodes', classId],
    queryFn: async () => {
      if (!classId) return [];
      const data = await taskTreeApi.getTeacherNodes(classId);
      return data.nodes;
    },
    enabled: !!classId,
  });
}

export function useCreateTaskNodeMutation() {
  return useMutation({
    mutationFn: (payload: TaskNodePayload) => taskTreeApi.createNode(payload),
  });
}

export function useUpdateTaskNodeMutation() {
  return useMutation({
    mutationFn: (payload: {
      nodeId: number;
      data: {
        title: string;
        description: string;
        points_reward: number;
        x_pos: number;
        y_pos: number;
      };
    }) => taskTreeApi.updateNode(payload.nodeId, payload.data),
  });
}

export function useDeleteTaskNodeMutation() {
  return useMutation({
    mutationFn: (nodeId: number) => taskTreeApi.deleteNode(nodeId),
  });
}
