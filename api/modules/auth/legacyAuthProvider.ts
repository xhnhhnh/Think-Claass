/**
 * Legacy authentication adapter.
 *
 * Implements the kernel's `AuthProvider` port on top of the existing credential
 * verification in `AuthService`, so sessions can be issued during the migration
 * without first migrating identity into a plugin.
 *
 * This file is the seam that disappears in P3, when the `identity` foundation
 * plugin implements `AuthProvider` against its own repository.
 */

import type { Actor } from '@thinkclass/contracts';
import type { AuthCredentials, AuthenticatedIdentity, AuthProvider } from '@thinkclass/kernel';

import { AuthService } from './auth.service.js';

interface LegacyLoginUser {
  id: number;
  role: Actor['role'];
  username: string;
  studentId?: number;
  parentId?: number;
  classId?: number;
  class_id?: number;
}

export function createLegacyAuthProvider(service: AuthService = new AuthService()): AuthProvider {
  return {
    async authenticate({ username, password, role }: AuthCredentials): Promise<AuthenticatedIdentity | null> {
      let result: Awaited<ReturnType<AuthService['login']>>;
      try {
        result = await service.login({ username, password, role });
      } catch {
        // AuthService throws ApiError(401) for bad credentials; the port models
        // failure as null so the kernel decides the HTTP shape.
        return null;
      }

      const user = (result as { user?: LegacyLoginUser }).user;
      if (!user?.id || !user.role) return null;

      const classId = user.classId ?? user.class_id;
      const actor: Actor = {
        userId: user.id,
        role: user.role,
        ...(user.studentId === undefined ? {} : { studentId: user.studentId }),
        ...(classId === undefined ? {} : { classId }),
      };

      return {
        actor,
        profile: {
          user: result.user,
          classFeatures: (result as { classFeatures?: unknown }).classFeatures ?? null,
        },
      };
    },
  };
}
