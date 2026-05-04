import { apiGet, apiPost } from '@/lib/api';
import type { PraiseDto } from '@/shared/engagement/contracts';

export type Praise = PraiseDto;

export const praisesApi = {
  getStudentPraises: (studentId: number) => apiGet<{ success: true; praises: PraiseDto[] }>(`/api/praises/student/${studentId}`),
  sendPraise: (data: { teacher_id: number; student_id: number; content: string; color: string }) =>
    apiPost<{ success: true }>('/api/praises', data),
};
