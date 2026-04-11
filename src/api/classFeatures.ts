import { apiGet, apiPut } from '@/lib/api';
import type { ClassFeatures } from '@/lib/classFeatures';

export const classFeaturesApi = {
  getFeatures: (classId: number) =>
    apiGet<{ success: true; classId: number; features: ClassFeatures; pet_selection_mode: string }>(`/api/classes/${classId}/features`),
  updateFeatures: (classId: number, data: Partial<ClassFeatures> & { pet_selection_mode?: string }) =>
    apiPut<{ success: true; features: ClassFeatures; pet_selection_mode: string }>(`/api/classes/${classId}/features`, data),
};
