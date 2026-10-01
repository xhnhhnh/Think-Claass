import { apiGet, apiPost } from '@/lib/api';
import type { PraiseDto } from '@thinkclass/contracts/domains/engagement';

export type Praise = PraiseDto;

export const praisesApi = {
  getStudentPraises: (studentId: number) => apiGet<{ success: true; praises: PraiseDto[] }>(`/api/praises/student/${studentId}`),
  /**
   * Every praise the class's pupils have received, newest first.
   *
   * The teacher's console could *give* praise (`sendPraise` below) and read one pupil's wall, but not
   * see the class roll-up - and `GET /api/praises?classId=` was the one route in this family left with
   * no caller. The server resolves `student_name` on each row and refuses a class the teacher does
   * not own (`assertClassAccess`).
   */
  getClassPraises: (classId: number) =>
    apiGet<{ success: true; praises: PraiseDto[] }>(`/api/praises?classId=${classId}`),
  sendPraise: (data: { teacher_id: number; student_id: number; content: string; color: string }) =>
    apiPost<{ success: true }>('/api/praises', data),
};
