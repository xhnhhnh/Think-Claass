/**
 * Request-level authorization for the `parent-buff` HTTP surface.
 *
 * The plugin serves one route, `POST /api/parent-buff`, and it was anonymous: the matrix records
 * that anyone could forge a parent's participation record and trigger the 20% points bonus the
 * classroom reads out of `parent_activity` (`classroom.service.ts:430-438`).
 *
 * The helper is defined here rather than imported from `plugins/system` or `plugins/learning`:
 * guardrail G1 forbids a plugin reaching into another plugin's internals, so the semantics are
 * replicated instead of the code:
 *
 *   401 - "we do not know who you are"   (未登录或登录已过期)
 *   403 - "we know, and you may not"     (无权限执行该操作)
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware is
 * installed in both compositions, and it is the *only* identity source a plugin may use: the
 * pre-migration `getRequestActor()` fell back to the raw `x-user-role` / `x-user-id` headers, which
 * would let a forged header outrank the middleware's verdict.
 *
 * Type-only imports apart, nothing here reaches outside the plugin: `getRequestContext` is a kernel
 * primitive, not another plugin's internals.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
  /** Resolved by the host's scope resolver when it runs; never the authority on ownership. */
  studentId?: number;
}

function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor
    ? { id: actor.userId, role: actor.role, studentId: actor.studentId }
    : { id: null, role: null };
}

/** The canonical gate: 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}
