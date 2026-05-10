import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { FamilyTaskDto, FamilyTaskPayload } from '@/shared/engagement/contracts';

export const familyTasksApi = {
  getTasks: (studentId: number) => apiGet<{ success: true; tasks: FamilyTaskDto[] }>(`/api/family-tasks?studentId=${studentId}`),
  getParentTasks: (parentId: number) => apiGet<{ success: true; tasks: FamilyTaskDto[] }>(`/api/family-tasks?parentId=${parentId}`),
  createTask: (payload: FamilyTaskPayload) => apiPost<{ success: true; task?: FamilyTaskDto }>('/api/family-tasks', payload),
  updateTaskStatus: (taskId: number, status: 'approved' | 'rejected') =>
    apiPut<{ success: true; message?: string }>(`/api/family-tasks/${taskId}`, { status }),
  deleteTask: (taskId: number) => apiDelete<{ success: true; message?: string }>(`/api/family-tasks/${taskId}`),
};
