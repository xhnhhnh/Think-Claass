import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  ActivationCodeListItem,
  AdminAnnouncementListItem,
  AdminSession,
  AuditLogListResponse,
  AuditLogQuery,
  DatabaseImportResult,
  DatabaseResetResult,
  GenerateActivationCodesResult,
  OpenApiKeyListItem,
  OpenSchoolListItem,
  SystemSettings,
  SystemStatsResponse,
  TeacherListItem,
  UpsertAdminAnnouncementInput,
  UpsertOpenSchoolInput,
  UpsertTeacherInput,
} from '@/shared/admin/contracts';

export interface AdminCredentials {
  username: string;
  password: string;
}

function unwrapData<T>(response: { data?: T } | T): T {
  if (response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)) {
    return (response as { data: T }).data;
  }
  return response as T;
}

export const adminClient = {
  createSession: async (credentials: AdminCredentials): Promise<AdminSession> => {
    const response = await apiPost<{ success: true; data: AdminSession }>('/api/admin/session', credentials);
    return unwrapData(response);
  },

  getSystemStats: async (): Promise<SystemStatsResponse> => {
    const response = await apiGet<{ success: true; data: SystemStatsResponse }>('/api/admin/system/stats');
    return unwrapData(response);
  },

  getSystemSettings: async (): Promise<SystemSettings> => {
    const response = await apiGet<{ success: true; data: SystemSettings }>('/api/admin/system/settings');
    return unwrapData(response);
  },

  updateSystemSettings: async (input: Partial<SystemSettings>): Promise<SystemSettings> => {
    const response = await apiPut<{ success: true; data: SystemSettings }>('/api/admin/system/settings', input);
    return unwrapData(response);
  },

  importDatabase: async (formData: FormData): Promise<DatabaseImportResult> => {
    const response = await apiPost<{ success: true; data: DatabaseImportResult }>(
      '/api/admin/system/database/import',
      formData,
    );
    return unwrapData(response);
  },

  resetDatabase: async (): Promise<DatabaseResetResult> => {
    const response = await apiPost<{ success: true; data: DatabaseResetResult }>('/api/admin/system/database/reset');
    return unwrapData(response);
  },

  getDatabaseExportUrl: (): string => '/api/admin/system/database/export',

  getTeachers: async () => {
    const response = await apiGet<{ success: true; data?: { items: TeacherListItem[]; total: number }; users?: TeacherListItem[] }>('/api/admin/users');
    return response.data?.items ?? response.users ?? [];
  },
  createTeacher: (input: UpsertTeacherInput) => apiPost<{ success: true; data?: TeacherListItem; message?: string }>('/api/admin/users', input),
  updateTeacher: (id: number, input: UpsertTeacherInput) =>
    apiPut<{ success: true; data?: TeacherListItem; message?: string }>(`/api/admin/users/${id}`, input),
  deleteTeacher: (id: number) => apiDelete<{ success: true; message?: string }>(`/api/admin/users/${id}`),

  getActivationCodes: async () => {
    const response = await apiGet<{ success: true; data?: { items: ActivationCodeListItem[] }; codes?: ActivationCodeListItem[] }>('/api/admin/codes');
    return response.data?.items ?? response.codes ?? [];
  },
  generateActivationCodes: (count: number) =>
    apiPost<{ success: true; data?: GenerateActivationCodesResult; message?: string }>('/api/admin/codes', { count }),

  getAnnouncements: async () => {
    const response = await apiGet<{ success: true; data?: { items: AdminAnnouncementListItem[] }; announcements?: AdminAnnouncementListItem[] }>(
      '/api/admin/announcements',
    );
    return response.data?.items ?? response.announcements ?? [];
  },
  createAnnouncement: (input: UpsertAdminAnnouncementInput) =>
    apiPost<{ success: true; data?: AdminAnnouncementListItem; message?: string }>('/api/admin/announcements', input),
  updateAnnouncement: (id: number, input: UpsertAdminAnnouncementInput) =>
    apiPut<{ success: true; data?: AdminAnnouncementListItem; message?: string }>(`/api/admin/announcements/${id}`, input),
  deleteAnnouncement: (id: number) => apiDelete<{ success: true; message?: string }>(`/api/admin/announcements/${id}`),

  getAuditLogs: (query: AuditLogQuery) => {
    const params = new URLSearchParams();
    if (query.teacherId) params.set('teacher_id', String(query.teacherId));
    if (query.userId) params.set('user_id', String(query.userId));
    if (query.action) params.set('action', query.action);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));
    return apiGet<{ success: true; data: AuditLogListResponse['items']; total: number }>(`/api/audit-logs?${params.toString()}`);
  },

  getOpenApiKeys: async (): Promise<OpenApiKeyListItem[]> => {
    const response = await apiGet<{ success: true; keys: Array<Record<string, unknown>> }>('/api/openapi/keys');
    return response.keys.map((key) => ({
      id: Number(key.id),
      name: String(key.name ?? ''),
      apiKey: String(key.apiKey ?? key.api_key ?? key.key ?? ''),
      createdAt: typeof key.created_at === 'string' ? key.created_at : typeof key.createdAt === 'string' ? key.createdAt : null,
      lastUsedAt: typeof key.last_used_at === 'string' ? key.last_used_at : typeof key.lastUsedAt === 'string' ? key.lastUsedAt : null,
      isActive: key.is_active === 1 || key.isActive === true,
    }));
  },
  createOpenApiKey: (name: string) => apiPost<{ success: true; key: OpenApiKeyListItem }>('/api/openapi/keys', { name }),
  deleteOpenApiKey: (id: number) => apiDelete<{ success: true }>(`/api/openapi/keys/${id}`),
  getSchools: async (): Promise<OpenSchoolListItem[]> => {
    const response = await apiGet<{ success: true; schools: Array<Record<string, unknown>> }>('/api/openapi/schools');
    return response.schools.map((school) => ({
      id: Number(school.id),
      name: String(school.name ?? ''),
      description: String(school.description ?? ''),
      contactInfo: String(school.contactInfo ?? school.contact_info ?? ''),
      createdAt: typeof school.created_at === 'string' ? school.created_at : typeof school.createdAt === 'string' ? school.createdAt : null,
    }));
  },
  createSchool: (input: UpsertOpenSchoolInput) =>
    apiPost<{ success: true; school: OpenSchoolListItem }>('/api/openapi/schools', {
      name: input.name,
      description: input.description,
      contact_info: input.contactInfo,
    }),
  deleteSchool: (id: number) => apiDelete<{ success: true }>(`/api/openapi/schools/${id}`),
};
