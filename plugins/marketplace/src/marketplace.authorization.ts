/**
 * Request-level authorization for the `/api/shop` surface.
 *
 * All sixteen routes used to answer anyone. The sharpest cases were the money paths: the body
 * carried `studentId` and nobody compared it with the caller, so an anonymous request could spend
 * another student's points (`POST /api/shop/buy`, `/auctions/:id/bid`, `/blind_box`). The
 * administrative half was just as open - `POST /api/shop` fell back to the first teacher in the
 * database when `teacher_id` was absent, and `PUT /api/shop/:id` edited any item.
 *
 * The semantics are the ones `plugins/system/src/system.authorization.ts` established for the
 * operator surface, and the wording is fixed by the round's ruling:
 *
 *   401 - "we do not know who you are"   (`未登录或登录已过期`)
 *   403 - "we know, and you may not"     (`无权限执行该操作`)
 *
 * The helper is defined here rather than imported from another plugin: guardrail G1 forbids a
 * plugin reaching into another plugin's internals, so the semantics are replicated, not the code.
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware (both
 * compositions install it) verifies the bearer token and owns the `x-user-role` / `x-user-id`
 * migration bridge, so a plugin reading raw headers - as the deleted `getRequestActor()` did as a
 * fallback - would let a forged header outrank the middleware's verdict. If the middleware is
 * missing, `getRequestContext` throws and the request fails closed (500, no data).
 *
 * `Actor.studentId` is the student *row* id, resolved by the host from
 * `classroom.public.getStudentByUserId`; `Actor.userId` is the login id. They are different numbers
 * and conflating them is the defect this module exists to prevent - see `studentActorId`.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

/** The authenticated caller, with the domain scope the host resolved onto the actor. */
export interface RequestActor {
  /** The login row (`users.id`). */
  userId: number;
  role: string;
  /** The `students` row behind a student login, or null when the login has none. */
  studentId: number | null;
  /** The class of that student row, when the host could resolve it. */
  classId: number | null;
}

/** The caller as the kernel's verified request context resolved them, or null when anonymous. */
export function actorOf(req: Request): RequestActor | null {
  const actor = getRequestContext(req).actor;
  if (!actor) return null;
  return {
    userId: actor.userId,
    role: actor.role,
    studentId: actor.studentId ?? null,
    classId: actor.classId ?? null,
  };
}

/** 401 when the request carries no verified actor. */
export function requireActor(req: Request): RequestActor {
  const actor = actorOf(req);
  if (!actor) throw new ApiError(401, '未登录或登录已过期');
  return actor;
}

/** The legacy `requireActorRole`: 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = requireActor(req);
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}

/**
 * The `students` row id behind a student actor - the fix for the pre-existing `studentActorId`,
 * which returned `actor.userId`.
 *
 * `userId` is the login (`users.id`) and `studentId` is the roster row (`students.id`); they are
 * unrelated numbers. The old version therefore compared a login id against a student id, which
 * either refused the real student (the common case: `users.id` and `students.id` rarely coincide)
 * or - worse - let one caller spend the points of whichever student happened to share their numeric
 * id. Money routes must fail closed when the scope cannot be established, hence 403 rather than a
 * fallback to the body.
 */
export function studentActorId(req: Request): number {
  const actor = requireActorRole(req, ['student']);
  if (actor.studentId === null) throw new ApiError(403, '无权限执行该操作');
  return actor.studentId;
}

/**
 * Refuse a body/query that names a student other than the authenticated one.
 *
 * The money routes still receive `studentId` from the client (the deployed frontend sends it), and
 * the point of this round is that the value is *checked* rather than trusted. An absent field is not
 * an error: the caller's own row is what the handler uses either way.
 */
export function assertSameStudent(studentId: number, input: unknown): void {
  if (input === undefined || input === null || input === '') return;
  if (Number(input) !== studentId) throw new ApiError(403, '无权限执行该操作');
}
