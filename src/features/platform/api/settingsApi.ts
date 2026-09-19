import { apiGet, apiPut } from '@/lib/api';
import type { PublicSettingsDto } from '@thinkclass/contracts/domains/platform';

export type PublicSettings = Partial<PublicSettingsDto>;

export const settingsApi = {
  getSettings: () => apiGet<{ success: true; data: PublicSettings }>('/api/settings'),
  updateAdminSettings: (data: PublicSettings) => apiPut<{ success: true }>('/api/admin/system/settings', data),
};
