import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { adminClient } from '@/features/admin/api/adminClient';

export const adminApi = {
  getStats: async () => ({ success: true, data: await adminClient.getSystemStats() }),
  exportData: () => adminClient.getDatabaseExportUrl(),
  importData: async (formData: FormData) => ({ success: true, data: await adminClient.importDatabase(formData) }),
  resetDatabase: async () => {
    const data = await adminClient.resetDatabase();
    return { success: true, data, message: data.message };
  },
  getTeachers: () => apiGet('/api/admin/users'),
  createTeacher: (data: any) => apiPost('/api/admin/users', data),
  updateTeacher: (id: number, data: any) => apiPut(`/api/admin/users/${id}`, data),
  deleteTeacher: (id: number) => apiDelete(`/api/admin/users/${id}`),
  generateCodes: (count: number) => apiPost('/api/admin/codes', { count }),
  getCodes: () => apiGet('/api/admin/codes'),
  getAuditLogs: () => apiGet('/api/audit-logs'),
  getAnnouncements: () => apiGet('/api/admin/announcements'),
};
