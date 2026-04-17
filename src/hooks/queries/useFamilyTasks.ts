import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { familyTasksApi } from '@/api/familyTasks';
import { studentsApi } from '@/api/students';

export function useFamilyTasks(studentId: number | null) {
  return useQuery({
    queryKey: ['family-tasks', studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const data = await familyTasksApi.getTasks(studentId);
      return data.tasks;
    },
    enabled: !!studentId,
  });
}

export function useCreateFamilyTaskMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: familyTasksApi.createTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['family-tasks', studentId] });
      if (studentId) await queryClient.invalidateQueries({ queryKey: ['parent-dashboard', studentId] });
    },
  });
}

export function useUpdateFamilyTaskStatusMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      taskId: number;
      status: 'approved' | 'rejected';
      reward?: { studentId: number; amount: number; reason: string };
    }) => {
      const result = await familyTasksApi.updateTaskStatus(payload.taskId, payload.status);
      if (payload.status === 'approved' && payload.reward) {
        await studentsApi.updatePoints(payload.reward.studentId, {
          amount: payload.reward.amount,
          reason: payload.reward.reason,
        });
      }
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['family-tasks', studentId] });
      if (studentId) await queryClient.invalidateQueries({ queryKey: ['parent-dashboard', studentId] });
    },
  });
}

export function useDeleteFamilyTaskMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: familyTasksApi.deleteTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['family-tasks', studentId] });
      if (studentId) await queryClient.invalidateQueries({ queryKey: ['parent-dashboard', studentId] });
    },
  });
}
