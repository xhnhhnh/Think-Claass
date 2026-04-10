import { apiPost, apiGet, apiDelete } from '@/lib/api';

export const teacherApi = {
  batchImportStudents: (data: { students: { name: string; username: string }[]; class_id: number }) => 
    apiPost('/api/students/batch-import', data),
  batchPoints: (data: { studentIds: number[]; amount: number; reason: string }) => 
    apiPost('/api/students/batch-points', data),
  batchEdit: (data: { studentIds: number[]; action: string; value: any }) => 
    apiPost('/api/students/batch-edit', data),
  getClasses: (teacherId?: number) => apiGet(`/api/classes${teacherId ? `?teacherId=${teacherId}` : ''}`),
  createClass: (name: string) => apiPost('/api/classes', { name }),
  getGroups: (classId: number) => apiGet(`/api/groups?classId=${classId}`),
  createGroup: (name: string, classId: number) => apiPost('/api/groups', { name, class_id: classId }),
  getPresets: () => apiGet('/api/presets'),
  createPreset: (label: string, amount: number) => apiPost('/api/presets', { label, amount }),
  deletePreset: (id: number) => apiDelete(`/api/presets/${id}`),
  sendPraise: (data: { teacher_id: number; student_id: number; content: string; color: string }) => 
    apiPost('/api/praises', data),
};
