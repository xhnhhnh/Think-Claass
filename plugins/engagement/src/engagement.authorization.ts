/**
 * Request-level authorization for the `engagement` HTTP surface.
 *
 * The domain's 23 private routes - class announcements, praises, certificates, redemption
 * tickets, the message feed, family tasks, the lucky draw and danmaku - all used to answer
 * anyone with a URL. Every handler now resolves the caller from the kernel's verified request
 * context and refuses an anonymous one before it reads or writes anything.
 *
 * The helper is defined here rather than imported from `plugins/system` or
 * `plugins/learning`: guardrail G1 forbids a plugin reaching into another plugin's internals
 * (`plugins/system/src/system.authorization.ts` is not a published port), so the semantics are
 * replicated instead of the code:
 *
 *   401 - "we do not know who you are"   (未登录或登录已过期)
 *   403 - "we know, and you may not"     (无权限执行该操作)
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware is
 * installed in both compositions, and it is the *only* identity source a plugin may use: the
 * pre-migration `getRequestActor()` fell back to the raw `x-user-role` / `x-user-id` headers,
 * which would let a forged header outrank the middleware's verdict. If the middleware is missing
 * this throws and the request fails closed rather than degrading to headers.
 *
 * `RequestActor.studentId` is only a hint the host may fill in (see
 * `packages/kernel/src/http/requestContext.ts`'s scope resolver). Ownership is never decided from
 * it: the service resolves the actor's class/student scope through `classroom.public` on every
 * request, so a stale or absent hint cannot widen anyone's reach.
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

/** The roles that may reach anything: the admin console. */
export const STAFF_ROLES = ['admin', 'superadmin'];

export function isStaffAdmin(actor: RequestActor): boolean {
  return actor.role !== null && STAFF_ROLES.includes(actor.role);
}
