/**
 * Request-level helpers the admin controllers share.
 *
 * `ok()` and the actor resolution are ported from `api/utils/apiResponse.ts` and
 * `api/utils/requestAuth.ts` - the two functions the pre-migration controllers imported from
 * `api/**`, which a plugin may not reach. They are small enough to keep, and keeping them *here*
 * means the admin surface has one definition of "who is calling" instead of each controller
 * inventing one.
 */

import type { Request } from 'express';

import type { ApiSuccessResponse } from '@thinkclass/contracts/domains/admin';
import { ApiError, type RequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
}

export function ok<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return message ? { success: true, data, message } : { success: true, data };
}

/**
 * The caller, with the precedence the pre-migration `getRequestActor()` had:
 *
 *   1. the kernel's verified request context (populated from a session token, or from the
 *      `x-user-role` / `x-user-id` bridge while `ALLOW_LEGACY_HEADER_AUTH` is on);
 *   2. the raw headers, **only** when the middleware did not run.
 *
 * Step 2 is not redundant for the admin routes: they are mounted by a plugin, and a deployment that
 * mounts plugin routers without the kernel middleware would otherwise see every caller as
 * anonymous. When the middleware *did* run its verdict is final - including "anonymous" - which is
 * what stops a forged header from working on the routes the bridge was switched off for.
 */
export function actorOf(req: Request): RequestActor {
  const context = (req as Request & { context?: RequestContext }).context;

  if (context) {
    const actor = context.actor;
    return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
  }

  const roleHeader = req.header('x-user-role');
  const idHeader = req.header('x-user-id');
  const parsedId = idHeader ? Number(idHeader) : null;

  return {
    id: parsedId !== null && Number.isFinite(parsedId) ? parsedId : null,
    role: roleHeader ?? null,
  };
}

/**
 * The pre-migration `requireActorRole`: 401 means "we do not know who you are", 403 means "we know,
 * and you may not".
 */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) {
    throw new ApiError(401, '未登录或登录已过期');
  }
  if (!allowedRoles.includes(actor.role)) {
    throw new ApiError(403, '无权限执行该操作');
  }
  return actor;
}

/** `/api/admin/*` is the console: admins and superadmins only, everywhere. */
export function requireAdmin(req: Request): RequestActor {
  return requireActorRole(req, ['admin', 'superadmin']);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal Server Error';
}
