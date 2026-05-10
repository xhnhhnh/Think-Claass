import type { ApiSuccess } from '../core/contracts';

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
};

export interface InviteCodeResponse {
  success: boolean;
  message?: string;
  classId?: number;
  className?: string;
  students?: Array<{ id: number; name: string }>;
}
