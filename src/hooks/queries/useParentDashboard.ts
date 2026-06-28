import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { parentBuffApi } from '@/api/parentBuff';
import { parentDashboardApi } from '@/api/parentDashboard';
import { defaultClassFeatures } from '@/lib/classFeatures';
import { useStore } from '@/store/useStore';

export function useParentDashboard(studentId: number | null) {
  const familyTasksEnabled = useStore(
    (state) => (state.user?.classFeatures ?? defaultClassFeatures).enable_family_tasks,
  );

  return useQuery({
    queryKey: ['parent-dashboard', studentId, familyTasksEnabled],
    queryFn: async () => {
      if (!studentId) return null;
      const [studentData, recordsData, tasksData, petData] = await Promise.all([
        parentDashboardApi.getStudent(studentId),
        parentDashboardApi.getRecords(studentId),
        familyTasksEnabled
          ? parentDashboardApi.getTasks(studentId, { showError: false }).catch(() => ({ success: true, tasks: [] }))
          : Promise.resolve({ success: true, tasks: [] }),
        parentDashboardApi.getPet(studentId, { showError: false }).catch(() => ({ success: true, pet: null })),
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
