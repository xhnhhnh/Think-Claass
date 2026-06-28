import { apiGet } from '@/lib/api';

type QuietApiOptions = {
  showError?: boolean;
};

export const parentDashboardApi = {
  getStudent: (studentId: number) => apiGet<{ success: true; student: any }>(`/api/students/${studentId}`),
  getRecords: (studentId: number) =>
    apiGet<{ success: true; records: any[] }>(`/api/students/records?studentId=${studentId}`),
  getTasks: (studentId: number, options?: QuietApiOptions) =>
    apiGet<{ success: true; tasks: any[] }>(`/api/family-tasks?studentId=${studentId}`, options),
  getPet: (studentId: number, options?: QuietApiOptions) =>
    apiGet<{ success: true; pet: any }>(`/api/pets/${studentId}`, options),
};
