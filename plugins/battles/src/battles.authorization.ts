/**
 * Request-level authorization for the `api/battles` surface.
 *
 * Class-vs-class battles are a teacher feature, and the matrix says so per route: the class search
 * and every write are `teacher/admin`, while a class's battle list and a battle's stats are
 * readable by the participating teachers, the students of the participating classes, and admin.
 * All thirteen routes were reachable with no credential at all before this batch - anonymous could
 * list every class (names and teachers), read any battle, and initiate, accept, reject or end any
 * class's battle.
 *
 * The role gate (401 / 403) lives here; the *scope* - is this your class, are you in this battle -
 * lives in `BattlesService`, because deciding it needs the battle row and the class rows this
 * plugin reaches through `classroom.public`.
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
