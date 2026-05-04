import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { Assignment, AssignmentPayload, StudentAssignment, StudentAssignmentUpdatePayload } from '@/shared/learning/contracts';

export const assignmentsApi = {
  list: (classId?: number) => {
    const suffix = classId ? `?class_id=${classId}` : '';
    return apiGet<{ success: true; data: Assignment[] }>(`/api/assignments${suffix}`);
  },
  create: (payload: AssignmentPayload) => apiPost<{ success: true; data: { id: number }; id: number }>('/api/assignments', payload),
  update: (id: number, payload: Partial<AssignmentPayload>) => apiPut<{ success: true }>(`/api/assignments/${id}`, payload),
  delete: (id: number) => apiDelete<{ success: true }>(`/api/assignments/${id}`),
  listStudentAssignments: (input: { studentId?: number; assignmentId?: number } = {}) => {
    const params = new URLSearchParams();
    if (input.studentId) params.set('student_id', String(input.studentId));
    if (input.assignmentId) params.set('assignment_id', String(input.assignmentId));
    const suffix = params.toString() ? `?${params}` : '';
    return apiGet<{ success: true; data: StudentAssignment[] }>(`/api/assignments/student-assignments${suffix}`);
  },
  updateStudentAssignment: (id: number, payload: StudentAssignmentUpdatePayload) =>
    apiPut<{ success: true }>(`/api/assignments/student-assignments/${id}`, payload),
};

export type { Assignment, AssignmentPayload, StudentAssignment, StudentAssignmentUpdatePayload };
