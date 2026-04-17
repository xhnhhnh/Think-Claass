import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { petApi } from '@/api/pet';
import { studentsApi } from '@/api/students';
import { apiGet } from '@/lib/api';

export function useStudentPetData(studentId: number | null) {
  return useQuery({
    queryKey: ['student-pet-data', studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const [petData, studentsData, praiseData, recordsData] = await Promise.all([
        petApi.getStudentPet(studentId),
        studentsApi.getStudents(),
        apiGet(`/api/praises/student/${studentId}`),
        studentsApi.getRecords({ studentId }),
      ]);
      const student = (studentsData as any).students?.find((s: any) => s.id === studentId);
      return {
        pet: petData.pet,
        availablePoints: student?.available_points ?? 0,
        praises: (praiseData as any).praises ?? [],
        records: (recordsData as any).records ?? [],
      };
    },
    enabled: !!studentId,
  });
}

export function useClassPets(classId: number | string | null) {
  return useQuery({
    queryKey: ['class-pets', classId],
    queryFn: async () => {
      if (!classId) return [];
      const data = await petApi.getClassPets(classId);
      return data.students;
    },
    enabled: !!classId,
  });
}

export function usePetActionMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload:
        | { type: 'adopt'; elementType: string; customImage?: string | null }
        | { type: 'interact'; actionType: string; cost: number; expGain: number; actionLogType?: string }
        | { type: 'update'; data: Record<string, unknown> },
    ) => {
      if (!studentId) throw new Error('学生信息不存在');
      if (payload.type === 'adopt') {
        return petApi.adoptPet({ studentId, elementType: payload.elementType, customImage: payload.customImage });
      }
      if (payload.type === 'interact') {
        return petApi.interact({
          studentId,
          actionType: payload.actionType,
          cost: payload.cost,
          expGain: payload.expGain,
          type: payload.actionLogType ?? 'FEED_PET',
        });
      }
      return petApi.updatePet(studentId, payload.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-pet-data', studentId] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}
