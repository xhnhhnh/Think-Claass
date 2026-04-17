import { apiGet, apiPost, apiPut } from '@/lib/api';

export const petApi = {
  getStudentPet: (studentId: number) => apiGet<{ success: true; pet: any | null }>(`/api/pets/${studentId}`),

  getClassPets: (classId: number | string) =>
    apiGet<{ success: true; students: any[] }>(`/api/pets/admin/class/${classId}`),

  adoptPet: (payload: { studentId: number; elementType: string; customImage?: string | null }) =>
    apiPost<{ success: true; pet: any }>('/api/pets/adopt', payload),

  updatePet: (studentId: number, payload: Record<string, unknown>) =>
    apiPut<{ success: true; pet?: any }>(`/api/pets/${studentId}`, payload),

  interact: (payload: {
    studentId: number;
    actionType: string;
    cost: number;
    expGain: number;
    type?: string;
  }) => apiPost<{ success: true; pet: any; points: number }>('/api/pets/interact', payload),
};
