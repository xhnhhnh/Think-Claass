import { apiGet, apiPost, apiPut } from '@/lib/api';

export const studentsApi = {
  getStudents: (classId?: number) => apiGet(`/api/students${classId ? `?classId=${classId}` : ''}`),
  getStudentById: (id: number) => apiGet(`/api/students/${id}`),
  checkin: (studentId: number) => apiPost('/api/students/checkin', { studentId }),
  giftPoints: (data: { senderId: number; receiverId: number; points: number; message?: string }) => 
    apiPost('/api/students/gift', data),
  submitPeerReview: (id: number, data: { reviewee_id: number; score: number; comment: string; is_anonymous: boolean }) => 
    apiPost(`/api/students/${id}/peer-reviews`, data),
  getRecords: (params: { studentId?: number; teacherId?: number }) => {
    const query = new URLSearchParams();
    if (params.studentId) query.append('studentId', params.studentId.toString());
    if (params.teacherId) query.append('teacherId', params.teacherId.toString());
    return apiGet(`/api/students/records?${query.toString()}`);
  },
  getAchievements: (id: number) => apiGet(`/api/students/${id}/achievements`),
  updatePoints: (id: number, data: { amount: number; reason: string }) => 
    apiPost(`/api/students/${id}/points`, data),
  updateClass: (id: number, classId: number) => apiPut(`/api/students/${id}/class`, { classId }),
  updateGroup: (id: number, groupId: number | null) => apiPut(`/api/students/${id}/group`, { groupId }),
  resetPassword: (id: number, password: string) => apiPut(`/api/students/${id}/password`, { password }),
};
