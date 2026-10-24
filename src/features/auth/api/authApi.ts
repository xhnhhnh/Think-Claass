import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  ActivatePayload,
  AuthResponse,
  InviteCodeResponse,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from '@thinkclass/contracts/domains/auth';

export const authApi = {
  /**
   * A 401 here is a wrong username/password/role, not an expired session - see `authFailure` in
   * `src/lib/api.ts`. The pages own the inline message, so the client does not also toast it.
   */
  login: (data: LoginPayload) =>
    apiPost<AuthResponse>('/api/auth/login', data, {
      showError: false,
      authFailure: 'credential',
    }),

  adminLogin: async (data: LoginPayload) => {
    const response = await apiPost<AuthResponse>('/api/admin/session', data, {
      showError: false,
      authFailure: 'credential',
    });
    return {
      success: response.success,
      user: response.data.user,
      data: response.data,
    };
  },

  register: (data: RegisterPayload) =>
    apiPost<AuthResponse>('/api/auth/register', data, {
      showError: false,
      authFailure: 'credential',
    }),

  activate: (data: ActivatePayload) =>
    apiPost<AuthResponse>('/api/auth/activate', data, { showError: false }),

  updateProfile: (data: UpdateProfilePayload) =>
    apiPut<AuthResponse>('/api/auth/profile', data, { showError: false }),

  verifyInviteCode: (code: string, role?: string) =>
    apiGet<InviteCodeResponse>(`/api/classes/invite/${code}${role ? `?role=${role}` : ''}`, {
      showError: false,
    }),
};

export type {
  ActivatePayload,
  AuthResponse,
  AuthUser,
  InviteCodeResponse,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from '@thinkclass/contracts/domains/auth';
