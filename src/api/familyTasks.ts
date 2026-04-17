import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

export const familyTasksApi = {
  getTasks: (studentId: number) => apiGet<{ success: true; tasks: any[] }>(`/api/family-tasks?studentId=${studentId}`),

  createTask: (payload: { student_id: number; parent_id: number; title: string; points: number }) =>
    apiPost<{ success: true }>('/api/family-tasks', payload),

  updateTaskStatus: (taskId: number, status: 'approved' | 'rejected') =>
    apiPut<{ success: true }>(`/api/family-tasks/${taskId}`, { status }),

  deleteTask: (taskId: number) => apiDelete<{ success: true }>(`/api/family-tasks/${taskId}`),
};
