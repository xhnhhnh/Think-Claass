import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { parentBuffApi } from '@/api/parentBuff';
import { parentDashboardApi } from '@/api/parentDashboard';

export function useParentDashboard(studentId: number | null) {
  return useQuery({
    queryKey: ['parent-dashboard', studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const [studentData, recordsData, tasksData, petData] = await Promise.all([
        parentDashboardApi.getStudent(studentId),
        parentDashboardApi.getRecords(studentId),
        parentDashboardApi.getTasks(studentId),
        parentDashboardApi.getPet(studentId),
      ]);
      return {
        student: studentData.student,
        records: recordsData.records,
        tasks: tasksData.tasks,
        pet: petData.pet,
      };
    },
    enabled: !!studentId,
  });
}

export function useParentBuffMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error('学生信息不存在');
      return parentBuffApi.cast(studentId);
    },
    onSuccess: async () => {
      if (!studentId) return;
      await queryClient.invalidateQueries({ queryKey: ['parent-dashboard', studentId] });
    },
  });
}
