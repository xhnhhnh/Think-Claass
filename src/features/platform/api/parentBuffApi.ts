import { apiPost } from '@/lib/api';

export const parentBuffApi = {
  cast: (studentId: number) => apiPost<{ success: true }>('/api/parent-buff', { studentId }),
};
