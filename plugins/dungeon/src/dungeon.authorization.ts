/**
 * Request-level authorization for the `api/dungeon` surface.
 *
 * All eight routes were reachable with no credential at all: an anonymous caller could start,
 * advance and abandon any student's run and settle its point rewards. The matrix rules them
 * `student（本人）/teacher（本班，只读）` - the acting student must be the row their own login owns, and a
 * teacher may only *read* a run of a student in a class they teach.
 *
 * So the controller answers 401 / 403 on the role (`requireActorRole`) and `DungeonService`
 * answers 403 on the scope, resolved through `classroom.public` from the actor and never from the
 * URL. 401 = "we do not know who you are"; 403 = "we know, and you may not".
 *
 * The helper is defined here rather than imported from `plugins/system`: guardrail G1 forbids a
 * plugin reaching into another plugin's internals, so the semantics are replicated instead of the
 * code. The caller comes from the kernel's request context and nowhere else - the pre-migration
 * `x-user-role` / `x-user-id` header fallback would let a forged header outrank the middleware.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
  /** The student row this login owns; filled in by the host's scope resolver when it runs. */
  studentId?: number;
  /** The class that student row is in; filled in by the same resolver. */
  classId?: number;
}

function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor
    ? { id: actor.userId, role: actor.role, studentId: actor.studentId, classId: actor.classId }
    : { id: null, role: null };
}

/** The caller, or 401 when the request carries no verified actor. */
export function requireActor(req: Request): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  return actor;
}

/** The legacy `requireActorRole`: 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = requireActor(req);
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}
