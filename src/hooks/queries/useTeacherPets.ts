import { useMutation, useQueryClient } from '@tanstack/react-query';

import { petApi } from '@/api/pet';

export function useTeacherPetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { studentId: number; data: Record<string, unknown> }) =>
      petApi.updatePet(payload.studentId, payload.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['class-pets'] });
      await queryClient.invalidateQueries({ queryKey: ['student-pet-data'] });
    },
  });
}
