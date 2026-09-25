/**
 * Request-level authorization for the `api/challenge` surface.
 *
 * Thirteen of the fourteen routes were anonymous before this batch: an unnamed caller could author
 * and delete world bosses, submit answers as any student, and attack a boss on any student's behalf.
 * The matrix splits the surface in three:
 *
 *   - boss authoring/deletion (`POST|DELETE /boss(es)`) - teacher/admin;
 *   - the global boss list - any signed-in caller, because students need it to attack;
 *   - the student-scoped and class-scoped routes - the student themselves (or a teacher of that
 *     student's class / that class's teacher), with the claim resolved from the actor through
 *     `classroom.public`; the URL or body `studentId` is never identity.
 *
 * 401 = "we do not know who you are" (`未登录或登录已过期`); 403 = "we know, and you may not"
 * (`无权限执行该操作`).
 *
 * `GET /api/challenge/questions` keeps the one gate it already had
 * (`ChallengeService.assertActorCanReadQuestions`); it is deliberately not re-gated here.
 *
 * The helper is defined here rather than imported from `plugins/system`: guardrail G1 forbids a
 * plugin reaching into another plugin's internals, so the semantics are replicated instead of the
 * code. The caller comes from the kernel's request context and nowhere else.
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
