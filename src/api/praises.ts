import { apiGet } from '@/lib/api';

export interface Praise {
  id: number;
  teacher_id: number;
  student_id: number;
  content: string;
  color: string;
  student_name: string;
  created_at: string;
}

export const praisesApi = {
  getStudentPraises: (studentId: number) => apiGet<{ success: true; praises: Praise[] }>(`/api/praises/student/${studentId}`),
};

