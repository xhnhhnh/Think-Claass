import { apiGet, apiPut } from '@/lib/api';

export interface PublicSettings {
  site_title?: string;
  site_favicon?: string;
  allow_teacher_registration?: string;
  revenue_enabled?: string;
  revenue_mode?: string;
  enable_teacher_analytics?: string;
  enable_parent_report?: string;
  payment_price?: string;
  payment_currency?: string;
  payment_description?: string;
  payment_environment?: string;
  payment_enable_wechat?: string;
  payment_enable_alipay?: string;
}

export const settingsApi = {
  getSettings: () => apiGet<{ success: true; data: PublicSettings }>('/api/settings'),
  updateAdminSettings: (data: Partial<PublicSettings>) =>
    apiPut<{ success: true }>('/api/admin/system/settings', data),
};
