/**
 * auth domain contracts.
 *
 * Moved from `src/shared/auth/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { ApiSuccess } from '@thinkclass/contracts';

export type AuthRole = 'student' | 'parent' | 'teacher' | 'admin' | 'superadmin' | string;

export interface LoginPayload {
  username: string;
  password: string;
  role?: AuthRole;
}

export interface RegisterPayload {
  username: string;
  password: string;
  role?: AuthRole;
  name?: string;
  invite_code?: string;
  student_id?: number | null;
}

export interface ActivatePayload {
  code: string;
  userId?: number;
}

export interface UpdateProfilePayload {
  username: string;
  password?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: AuthRole;
  name?: string | null;
  studentId?: number | null;
  classId?: number | null;
  is_activated?: boolean;
  [key: string]: unknown;
}

export interface ClassFeatureFlags {
  [key: string]: boolean | number | string | null | undefined;
}

export interface AuthResponseData {
  user: AuthUser;
  classFeatures?: ClassFeatureFlags;
}

export type AuthResponse = ApiSuccess<AuthResponseData> & {
  user?: AuthUser;
  classFeatures?: ClassFeatureFlags;
  message?: string;
  /** Opaque session token issued by the kernel at login (added in P2). */
  token?: string;
  expiresAt?: string;
};

export interface InviteCodeResponse {
  success: boolean;
  message?: string;
  classId?: number;
  className?: string;
  students?: Array<{ id: number; name: string }>;
}
