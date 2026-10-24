import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  BatchImportStudentPayload,
  BatchPointsPayload,
  CreateStudentPayload,
  PointRecordDto,
  StudentDto,
} from '@thinkclass/contracts/domains/classroom';

export interface StudentsResponse {
  success: true;
  students: StudentDto[];
}

export interface StudentResponse {
  success: true;
  student: StudentDto;
}

export interface StudentMotivationSummary {
  studentId: number;
  growth: number;
  collaboration: number;
  competition: number;
  participation: number;
  availableCredits: number;
  level: string;
  schoolStage: 'general' | 'primary' | 'middle' | 'high';
  parentBonusPercent: number;
  parentBlessingActive: boolean;
}

/**
 * One earned achievement as the student console understands it.
 *
 * `GET /api/students/:id/achievements` answers `achievements` as the *names* it has recorded
 * (`Array.from(Set)`: `['初出茅庐']`), which the page types as rows and matches by
 * `achievement_name`. The mismatch made every badge render 未解锁 while the counter showed the
 * real number; the facade normalises the names into partial rows so the page has one shape.
 * Only the name exists in the response - `unlocked_at`/`description` are optional and must not
 * be invented.
 */
export interface StudentAchievementDto {
  achievement_name: string;
  description?: string;
  unlocked_at?: string;
}

interface StudentAchievementsResponse {
  success: true;
  achievements: Array<StudentAchievementDto | string>;
  newAchievements?: string[];
}

export const studentsApi = {
  getStudents: (classId?: number | string | null) =>
    apiGet<StudentsResponse>(`/api/students${classId ? `?classId=${classId}` : ''}`),

  getStudentById: (id: number) => apiGet<StudentResponse>(`/api/students/${id}`),
  getSummary: (id: number) => apiGet<{ success: true; summary: StudentMotivationSummary }>(`/api/students/${id}/summary`),

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

  getAchievements: async (id: number) => {
    /*
      Kept as a single line on purpose: `client-endpoint-parity.test.ts` attributes a path literal
      to the API call nearest it (±3 lines), so a multi-line generic here made `GET
      /api/students/:x/achievements` look like a route with no client caller.
    */
    const response = await apiGet<StudentAchievementsResponse>(`/api/students/${id}/achievements`);

    return {
      ...response,
      achievements: (response.achievements ?? []).map((entry) =>
        typeof entry === 'string' ? { achievement_name: entry } : entry,
      ),
    };
  },

  updatePoints: (id: number, data: { amount: number; reason: string; requestId?: string }) =>
    apiPost<{ success: true; student: { total_points: number; available_points: number; applied: number; bonus: number } }>(`/api/students/${id}/points`, data),

  batchPoints: (payload: BatchPointsPayload & { requestId?: string }) => apiPost<{ success: true; message: string; results: Array<{ studentId: number; applied: number; bonus: number; total_points: number; available_points: number }> }>('/api/students/batch-points', payload),

  batchEdit: (data: { studentIds: number[]; action: string; value: unknown }) =>
    apiPost<{ success: true; message: string }>('/api/students/batch-edit', data),

  updateClass: (id: number, classId: number) => apiPut<{ success: true }>(`/api/students/${id}/class`, { class_id: classId }),

  updateGroup: (id: number, groupId: number | null) => apiPut<{ success: true }>(`/api/students/${id}/group`, { group_id: groupId }),

  resetPassword: (id: number, password: string) => apiPut<{ success: true; message: string }>(`/api/students/${id}/password`, { password }),
};
