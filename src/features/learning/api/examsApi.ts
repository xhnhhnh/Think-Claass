import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { Exam, ExamGrade, ExamPayload, SaveExamGradePayload } from '@/shared/learning/contracts';

export const examsApi = {
  getExams: (classId?: number) => {
    const suffix = classId ? `?class_id=${classId}` : '';
    return apiGet<{ success: true; data: Exam[] }>(`/api/exams${suffix}`);
  },
  createExam: (data: ExamPayload) => apiPost<{ success: true; data: { id: number }; id: number }>('/api/exams', data),
  deleteExam: (id: number) => apiDelete<{ success: true }>(`/api/exams/${id}`),
  getExamGrades: (id: number) => apiGet<{ success: true; data?: { exam: Exam; grades: ExamGrade[] }; exam: Exam; grades: ExamGrade[] }>(`/api/exams/${id}/grades`),
  saveExamGrades: (id: number, grades: SaveExamGradePayload[]) => apiPut<{ success: true }>(`/api/exams/${id}/grades`, { grades }),
  updateExam: (id: number, data: Partial<ExamPayload>) => apiPut<{ success: true }>(`/api/exams/${id}`, data),
  listStudentExams: (input: { studentId?: number; examId?: number } = {}) => {
    const params = new URLSearchParams();
    if (input.studentId) params.set('student_id', String(input.studentId));
    if (input.examId) params.set('exam_id', String(input.examId));
    const suffix = params.toString() ? `?${params}` : '';
    return apiGet<{ success: true; data: unknown[] }>(`/api/exams/student-exams${suffix}`);
  },
};

export type { Exam, ExamGrade, ExamPayload, SaveExamGradePayload };
