/**
 * Request-level authorization for the `api/slg` surface.
 *
 * Every one of these eight routes was reachable with no credential at all: an anonymous caller
 * could read any class's map, build territories for any class, settle a class's yield and spend any
 * student's points as that student. Two gates are needed, and they answer different questions:
 *
 *   - the **role** gate (401 / 403) - do we know who you are, and may your kind call this at all;
 *   - the **scope** gate - may *you* name this class / this student. It lives in `SlgService`,
 *     because deciding it needs the class row and the caller's own student row, which this
 *     plugin reaches through `classroom.public`.
 *
 * The URL's `:studentId` is never trusted: a student may only contribute as the student row their
 * login owns, which `SlgService.assertSelfStudent` resolves from the kernel actor (its `studentId`
 * when the host resolved scope, otherwise `classroom.public` by `userId`) - never from the request.
 *
 * 401 = "we do not know who you are" (`未登录或登录已过期`); 403 = "we know, and you may not"
 * (`无权限执行该操作`).
 *
 * The helper is defined here rather than imported from `plugins/system`: guardrail G1 forbids a
 * plugin reaching into another plugin's internals, so the semantics are replicated instead of the
 * code. The caller comes from the kernel's request context and nowhere else - the pre-migration
 * `x-user-role` / `x-user-id` header fallback would let a forged header outrank the middleware's
 * verdict.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
  /** The student row this login owns; filled in by the host's scope resolver when it runs. */
  studentId?: number;
  /** The class the actor's student row is in; filled in by the same resolver. */
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
