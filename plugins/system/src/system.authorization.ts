/**
 * Request-level authorization for the `api/system` surface.
 *
 * `/api/system/*` is the operator surface - question-bank CRUD, `system_settings`, the
 * operation-log reader and the whole-database backup export (which dumps `users`, hashes
 * included) - so every one of its eight routes is admin/superadmin only. None of them is
 * called by the frontend; locking them changes no UI behaviour.
 *
 * The helper is defined here rather than imported from `plugins/admin`: guardrail G1 forbids a
 * plugin reaching into another plugin's internals (`plugins/admin/src/admin.support.ts` is not a
 * published port), so the semantics are replicated instead of the code:
 *
 *   401 - "we do not know who you are"
 *   403 - "we know, and you may not"
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware is
 * installed in both compositions, and it is the *only* identity source a plugin may use: the
 * pre-migration `getRequestActor()` fell back to the raw `x-user-role` / `x-user-id` headers, which
 * would let a forged header outrank the middleware's verdict. If the middleware is missing this
 * throws and the request fails closed (500, no data) rather than degrading to headers.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
}

function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
}

/** The legacy `requireActorRole`: 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}

/** `/api/system/*` is the operator console: admins and superadmins only, everywhere. */
export function requireAdmin(req: Request): RequestActor {
  return requireActorRole(req, ['admin', 'superadmin']);
}
