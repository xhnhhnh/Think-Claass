import { apiPost, apiGet } from '@/lib/api';

export const authApi = {
  login: (data: any) => apiPost('/api/auth/login', data),
  adminLogin: async (data: any) => {
    const response = await apiPost('/api/admin/session', data);
    return {
      success: response.success,
      user: response.data.user,
      data: response.data,
    };
  },
  register: (data: any) => apiPost('/api/auth/register', data),
  activate: (data: { code: string; userId: number }) => apiPost('/api/auth/activate', data),
  verifyInviteCode: (code: string, role?: string) => apiGet(`/api/classes/invite/${code}${role ? `?role=${role}` : ''}`),
};
