import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  BatchImportStudentPayload,
  BatchPointsPayload,
  CreateStudentPayload,
  PointRecordDto,
  StudentDto,
} from '@/shared/classroom/contracts';

export interface StudentsResponse {
  success: true;
  students: StudentDto[];
}

export interface StudentResponse {
  success: true;
  student: StudentDto;
}

export const studentsApi = {
  getStudents: (classId?: number | string | null) =>
    apiGet<StudentsResponse>(`/api/students${classId ? `?classId=${classId}` : ''}`),

  getStudentById: (id: number) => apiGet<StudentResponse>(`/api/students/${id}`),

  createStudent: (payload: CreateStudentPayload) =>
    apiPost<{ success: true; message: string; student: StudentDto }>('/api/students', payload),

  batchImportStudents: (payload: BatchImportStudentPayload) =>
    apiPost<{ success: true; message: string; importedCount: number; students: StudentDto[] }>(
      '/api/students/batch-import',
      payload,
    ),

  checkin: (studentId: number) => apiPost<{ success: true; message: string; student: Partial<StudentDto> }>('/api/students/checkin', { studentId }),

  giftPoints: (data: { senderId: number; receiverId: number; points: number; message?: string }) =>
    apiPost<{ success: true; message: string }>('/api/students/gift', data),

  submitPeerReview: (id: number, data: { reviewee_id: number; score: number; comment: string; is_anonymous: boolean }) =>
    apiPost<{ success: true; message: string }>(`/api/students/${id}/peer-reviews`, data),

  getPendingPeerReviews: (id: number) =>
    apiGet<{ success: true; pending: Array<Pick<StudentDto, 'id' | 'name'>> }>(`/api/students/${id}/peer-reviews/pending`),

  getRecords: (params: { studentId?: number; teacherId?: number }) => {
    const query = new URLSearchParams();
    if (params.studentId) query.append('studentId', params.studentId.toString());
    if (params.teacherId) query.append('teacherId', params.teacherId.toString());
    return apiGet<{ success: true; records: PointRecordDto[] }>(`/api/students/records?${query.toString()}`);
  },

  getAchievements: (id: number) =>
    apiGet<{ success: true; achievements: Array<{ id: number; achievement_name: string; description: string; unlocked_at: string }> }>(
      `/api/students/${id}/achievements`,
    ),

  updatePoints: (id: number, data: { amount: number; reason: string }) =>
    apiPost<{ success: true; message: string }>(`/api/students/${id}/points`, data),

  batchPoints: (payload: BatchPointsPayload) => apiPost<{ success: true; message: string }>('/api/students/batch-points', payload),

  batchEdit: (data: { studentIds: number[]; action: string; value: unknown }) =>
    apiPost<{ success: true; message: string }>('/api/students/batch-edit', data),

  updateClass: (id: number, classId: number) => apiPut<{ success: true }>(`/api/students/${id}/class`, { class_id: classId }),

  updateGroup: (id: number, groupId: number | null) => apiPut<{ success: true }>(`/api/students/${id}/group`, { group_id: groupId }),

  resetPassword: (id: number, password: string) => apiPut<{ success: true; message: string }>(`/api/students/${id}/password`, { password }),
};
