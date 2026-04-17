import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  AdminSession,
  DatabaseImportResult,
  DatabaseResetResult,
  SystemSettings,
  SystemStatsResponse,
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
};
