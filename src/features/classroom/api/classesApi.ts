import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { ClassDto, GroupDto, PresetDto } from '@/shared/classroom/contracts';
import type { ClassFeatures } from '@/lib/classFeatures';

export const classroomApi = {
  getClasses: (teacherId?: number) => apiGet<{ success: true; classes: ClassDto[] }>(`/api/classes${teacherId ? `?teacherId=${teacherId}` : ''}`),

  createClass: (name: string, teacherId?: number) =>
    apiPost<{ success: true; class: ClassDto }>('/api/classes', { name, teacher_id: teacherId }),

  getClass: (classId: number) => apiGet<{ success: true; class: ClassDto }>(`/api/classes/${classId}`),

  getClassInvite: (code: string, role?: string) =>
    apiGet<{ success: true; class: ClassDto; students: Array<{ id: number; name: string }> }>(
      `/api/classes/invite/${code}${role ? `?role=${role}` : ''}`,
    ),

  getGroups: (classId: number) => apiGet<{ success: true; groups: GroupDto[] }>(`/api/groups?classId=${classId}`),

  createGroup: (name: string, classId: number) => apiPost<{ success: true; group: GroupDto }>('/api/groups', { name, class_id: classId }),

  getPresets: (teacherId?: number) => apiGet<{ success: true; presets: PresetDto[] }>(`/api/presets${teacherId ? `?teacherId=${teacherId}` : ''}`),

  createPreset: (label: string, amount: number, teacherId?: number) =>
    apiPost<{ success: true; preset: PresetDto }>('/api/presets', { label, amount, teacher_id: teacherId }),

  deletePreset: (id: number) => apiDelete<{ success: true }>(`/api/presets/${id}`),

  getFeatures: (classId: number) =>
    apiGet<{ success: true; classId: number; features: ClassFeatures; pet_selection_mode: string }>(`/api/classes/${classId}/features`),

  updateFeatures: (classId: number, data: Partial<ClassFeatures> & { pet_selection_mode?: string }) =>
    apiPut<{ success: true; features: ClassFeatures; pet_selection_mode: string }>(`/api/classes/${classId}/features`, data),

  getBigscreen: (classId: number) => apiGet<{ success: true; [key: string]: unknown }>(`/api/classes/${classId}/bigscreen`),

  getGuildRanking: (classId: number) =>
    apiGet<{ success: true; rankings: Array<{ id: number; name: string; total_score: number }>; isEnabled: boolean }>(
      `/api/classes/${classId}/guild-ranking`,
    ),
};

export const teacherApi = {
  batchImportStudents: studentsBatchImport,
  batchPoints: (data: { studentIds: number[]; amount: number; reason: string }) => studentsApi.batchPoints(data),
  batchEdit: (data: { studentIds: number[]; action: string; value: unknown }) => studentsApi.batchEdit(data),
  getClasses: classroomApi.getClasses,
  createClass: classroomApi.createClass,
  getGroups: classroomApi.getGroups,
  createGroup: classroomApi.createGroup,
  getPresets: classroomApi.getPresets,
  createPreset: classroomApi.createPreset,
  deletePreset: classroomApi.deletePreset,
  sendPraise: (data: { teacher_id: number; student_id: number; content: string; color: string }) =>
    apiPost<{ success: true }>('/api/praises', data),
};

import { studentsApi } from './studentsApi';

function studentsBatchImport(data: { students: { name: string; username: string }[]; class_id: number }) {
  return studentsApi.batchImportStudents(data);
}
