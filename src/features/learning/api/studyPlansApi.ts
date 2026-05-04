import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { StudyPlan, StudyPlanItem } from '@/shared/learning/contracts';

export const studyPlansApi = {
  my: () => apiGet<{ success: true; data: StudyPlan | null }>('/api/study-plans/my'),
  create: (data: { target_exam_date?: string | null; target_score?: number | null }) =>
    apiPost<{ success: true; data: StudyPlan }>('/api/study-plans', data),
  updateItem: (itemId: number, data: { status: string }) => apiPut<{ success: true; data: StudyPlanItem }>(`/api/study-plans/items/${itemId}`, data),
};

export type { StudyPlan, StudyPlanItem };
