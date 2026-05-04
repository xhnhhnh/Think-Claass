import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { Paper, PaperDetail, PaperItem } from '@/shared/learning/contracts';

export const papersApi = {
  list: (classId?: number) => {
    const suffix = classId ? `?class_id=${classId}` : '';
    return apiGet<{ success: true; data: Paper[] }>(`/api/papers${suffix}`);
  },
  create: (data: { title: string; class_id?: number | null; subject_id?: number | null; total_points?: number; source?: string; exam_date?: string | null }) =>
    apiPost<{ success: true; data: Paper }>('/api/papers', data),
  get: (paperId: number) => apiGet<{ success: true; data: PaperDetail }>(`/api/papers/${paperId}`),
  update: (
    paperId: number,
    data: Partial<{ title: string; status: string; class_id: number | null; subject_id: number | null; total_points: number; exam_date: string | null }>,
  ) => apiPut<{ success: true; data: Paper }>(`/api/papers/${paperId}`, data),
  saveStructure: (paperId: number, data: { sections: Array<{ title: string; order_no: number }>; items: unknown[]; rubric_points: unknown[] }) =>
    apiPut<{ success: true; data: PaperDetail }>(`/api/papers/${paperId}/structure`, data),
  uploadAsset: (paperId: number, formData: FormData) => apiPost<{ success: true; data: unknown }>(`/api/papers/${paperId}/assets`, formData),
};

export type { Paper, PaperDetail, PaperItem };
