import { apiGet, apiPost } from '@/lib/api';
import type { ActivatePayload, AuthResponse, InviteCodeResponse, LoginPayload, RegisterPayload } from '@/shared/auth/contracts';

export const authApi = {
  login: (data: LoginPayload) => apiPost<AuthResponse>('/api/auth/login', data),

  adminLogin: async (data: LoginPayload) => {
    const response = await apiPost<AuthResponse>('/api/admin/session', data);
    return {
      success: response.success,
      user: response.data.user,
      data: response.data,
    };
  },

  register: (data: RegisterPayload) => apiPost<AuthResponse>('/api/auth/register', data),

  activate: (data: ActivatePayload) => apiPost<AuthResponse>('/api/auth/activate', data),

  verifyInviteCode: (code: string, role?: string) =>
    apiGet<InviteCodeResponse>(`/api/classes/invite/${code}${role ? `?role=${role}` : ''}`),
};

export type { ActivatePayload, AuthResponse, AuthUser, InviteCodeResponse, LoginPayload, RegisterPayload } from '@/shared/auth/contracts';
