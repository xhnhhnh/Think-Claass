import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { petApi } from '../api/petApi';
import type { StudentPetMutationInput } from '../types';

export const petQueryKeys = {
  studentDashboard: (studentId: number | null) => ['pet', 'student-dashboard', studentId] as const,
  classPets: (classId: number | string | null) => ['pet', 'class-pets', classId] as const,
  students: ['students'] as const,
};

export function useStudentPetData(studentId: number | null) {
  return useQuery({
    queryKey: petQueryKeys.studentDashboard(studentId),
    queryFn: async () => {
      if (!studentId) return null;
      const response = await petApi.getStudentDashboard(studentId);
      return response.data;
    },
    enabled: !!studentId,
  });
}

export function useClassPets(classId: number | string | null) {
  return useQuery({
    queryKey: petQueryKeys.classPets(classId),
    queryFn: async () => {
      if (!classId) return [];
      const response = await petApi.getClassPets(classId);
      return response.data.students;
    },
    enabled: !!classId,
  });
}

export function usePetActionMutation(studentId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: StudentPetMutationInput) => {
      if (!studentId) throw new Error('学生信息不存在');

      if (payload.type === 'adopt') {
        return petApi.adoptPet(studentId, {
          elementType: payload.elementType,
          custom_image: payload.customImage,
        });
      }

      if (payload.type === 'interact') {
        return petApi.interact(studentId, {
          actionType: payload.actionType,
          cost: payload.cost,
          expGain: payload.expGain,
          type: payload.actionLogType ?? 'FEED_PET',
        });
      }

      return petApi.updatePet(studentId, payload.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: petQueryKeys.studentDashboard(studentId) });
      await queryClient.invalidateQueries({ queryKey: petQueryKeys.students });
    },
  });
}

export function useTeacherPetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { studentId: number; data: Record<string, unknown> }) =>
      petApi.updatePet(payload.studentId, payload.data),
    onSuccess: async (_data, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['pet', 'class-pets'] });
      await queryClient.invalidateQueries({ queryKey: petQueryKeys.classPets(null).slice(0, 2) });
      await queryClient.invalidateQueries({ queryKey: petQueryKeys.studentDashboard(payload.studentId) });
    },
  });
}
