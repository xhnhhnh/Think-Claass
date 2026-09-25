/**
 * Request-level authorization for the `/api/economy` surface.
 *
 * All twenty routes used to answer anyone, and the write half takes the student from the URL:
 * `POST /api/economy/students/:studentId/bank/deposits|withdrawals` and the
 * `/stocks/buy|sell` family (plus the older `/bank/deposit/:studentId`,
 * `/bank/withdraw/:studentId`, `/stocks/buy/:studentId`, `/stocks/sell/:studentId` aliases) let
 * an anonymous caller move any student's points. `POST /api/economy/bank/trigger-interest` settled
 * interest for every account in the database, and `/teacher/stocks*` was an open stock CRUD.
 *
 * The semantics are the ones `plugins/system/src/system.authorization.ts` established, and the
 * wording is fixed by the round's ruling:
 *
 *   401 - "we do not know who you are"   (`未登录或登录已过期`)
 *   403 - "we know, and you may not"     (`无权限执行该操作`)
 *
 * The helper is defined here rather than imported from another plugin: guardrail G1 forbids a
 * plugin reaching into another plugin's internals, so the semantics are replicated, not the code.
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware
 * (installed by both compositions) verifies the bearer token and owns the `x-user-role` /
 * `x-user-id` migration bridge, so a plugin reading raw headers would let a forged header outrank
 * its verdict. If the middleware is missing, `getRequestContext` throws and the request fails
 * closed (500, no data).
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
