import { adminClient } from '@/features/admin/api/adminClient';

export const adminApi = {
  getStats: async () => ({ success: true, data: await adminClient.getSystemStats() }),
  exportData: () => adminClient.getDatabaseExportUrl(),
  importData: async (formData: FormData) => ({ success: true, data: await adminClient.importDatabase(formData) }),
  resetDatabase: async () => {
    const data = await adminClient.resetDatabase();
    return { success: true, data, message: data.message };
  },
  getTeachers: async () => ({ success: true, users: await adminClient.getTeachers() }),
  createTeacher: adminClient.createTeacher,
  updateTeacher: adminClient.updateTeacher,
  deleteTeacher: adminClient.deleteTeacher,
  generateCodes: adminClient.generateActivationCodes,
  getCodes: async () => ({ success: true, codes: await adminClient.getActivationCodes() }),
  getAuditLogs: adminClient.getAuditLogs,
  getAnnouncements: async () => ({ success: true, announcements: await adminClient.getAnnouncements() }),
};
