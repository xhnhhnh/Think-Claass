import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

export const adminApi = {
  getStats: () => apiGet('/api/admin/stats'),
  exportData: () => apiGet('/api/admin/data/export'),
  importData: (formData: FormData) => apiPost('/api/admin/data/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  resetDatabase: () => apiPost('/api/admin/reset-database'),
  getTeachers: () => apiGet('/api/admin/users'),
  createTeacher: (data: any) => apiPost('/api/admin/users', data),
  updateTeacher: (id: number, data: any) => apiPut(`/api/admin/users/${id}`, data),
  deleteTeacher: (id: number) => apiDelete(`/api/admin/users/${id}`),
  generateCodes: (count: number) => apiPost('/api/admin/codes', { count }),
  getCodes: () => apiGet('/api/admin/codes'),
  getAuditLogs: () => apiGet('/api/audit-logs'),
  getAnnouncements: () => apiGet('/api/admin/announcements'),
};
