import { apiPost, apiGet } from '@/lib/api';

export const authApi = {
  login: (data: any) => apiPost('/api/auth/login', data),
  adminLogin: (data: any) => apiPost('/api/admin/login', data),
  register: (data: any) => apiPost('/api/auth/register', data),
  activate: (data: { code: string; userId: number }) => apiPost('/api/auth/activate', data),
  verifyInviteCode: (code: string, role?: string) => apiGet(`/api/classes/invite/${code}${role ? `?role=${role}` : ''}`),
};
