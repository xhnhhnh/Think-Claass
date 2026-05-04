import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskTreeApi, type TaskNodePayload } from '../api/taskTreeApi';

export const taskTreeKeys = {
  teacher: (classId: number | null) => ['teacher-task-nodes', classId] as const,
  student: (studentId: number | null) => ['student-task-nodes', studentId] as const,
};

export function useTeacherTaskNodes(classId: number | null) {
  return useQuery({
    queryKey: taskTreeKeys.teacher(classId),
    queryFn: async () => {
      if (!classId) return [];
      const data = await taskTreeApi.getTeacherNodes(classId);
      return data.data?.nodes ?? data.nodes;
    },
    enabled: !!classId,
  });
}

export function useStudentTaskNodes(studentId: number | null) {
  return useQuery({
    queryKey: taskTreeKeys.student(studentId),
    queryFn: async () => {
      if (!studentId) return [];
      const data = await taskTreeApi.getStudentNodes(studentId);
      return data.data?.nodes ?? data.nodes;
    },
    enabled: !!studentId,
  });
}

export function useCreateTaskNodeMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskNodePayload) => taskTreeApi.createNode(payload),
    onSuccess: async () => {
      if (classId) await queryClient.invalidateQueries({ queryKey: taskTreeKeys.teacher(classId) });
    },
  });
}

export function useUpdateTaskNodeMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { nodeId: number; data: { title: string; description: string; points_reward: number; x_pos: number; y_pos: number } }) =>
      taskTreeApi.updateNode(payload.nodeId, payload.data),
    onSuccess: async () => {
      if (classId) await queryClient.invalidateQueries({ queryKey: taskTreeKeys.teacher(classId) });
    },
  });
}

export function useDeleteTaskNodeMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: number) => taskTreeApi.deleteNode(nodeId),
    onSuccess: async () => {
      if (classId) await queryClient.invalidateQueries({ queryKey: taskTreeKeys.teacher(classId) });
    },
  });
}

export function useCompleteTaskNodeMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: number) => {
      if (!studentId) throw new Error('学生信息不存在');
      return taskTreeApi.completeNode(studentId, nodeId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taskTreeKeys.student(studentId) });
    },
  });
}
