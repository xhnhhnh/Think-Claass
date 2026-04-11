import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

export interface Exam {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  exam_date: string | null;
  total_score: number;
  created_at: string;
}

export interface ExamGrade {
  id: number;
  exam_id: number;
  student_id: number;
  student_name: string;
  score: number | null;
  feedback: string | null;
}

export const examsApi = {
  getExams: (classId?: number) => {
    const suffix = classId ? `?class_id=${classId}` : '';
    return apiGet<{ success: true; data: Exam[] }>(`/api/exams${suffix}`);
  },
  createExam: (data: {
    class_id: number;
    teacher_id: number;
    title: string;
    description?: string;
    exam_date?: string | null;
    total_score: number;
  }) => apiPost<{ success: true; id: number }>('/api/exams', data),
  deleteExam: (id: number) => apiDelete<{ success: true }>(`/api/exams/${id}`),
  getExamGrades: (id: number) => apiGet<{ success: true; exam: Exam; grades: ExamGrade[] }>(`/api/exams/${id}/grades`),
  saveExamGrades: (id: number, grades: Array<{ student_id: number; score: number | null; feedback?: string | null }>) =>
    apiPut<{ success: true }>(`/api/exams/${id}/grades`, { grades }),
  updateExam: (
    id: number,
    data: Partial<{ title: string; description: string; exam_date: string | null; total_score: number }>,
  ) => apiPut<{ success: true }>(`/api/exams/${id}`, data),
};
