/**
 * Request-level authorization for the `api/homework` surface.
 *
 * Every one of this plugin's sixteen routes is `auth: "actor"` in its manifest, and each handler
 * resolves the caller here *before* it does anything else - the gate runs ahead of every
 * validation message, so a refusal can never be produced by the service's error handling.
 *
 * The semantics are the split used across the application:
 *
 *   401 - "we do not know who you are"  (`未登录或登录已过期`)
 *   403 - "we know, and you may not"    (`无权限执行该操作`)
 *
 * The helper is defined here rather than imported from `plugins/assignments` or
 * `plugins/learning`: guardrail G1 forbids a plugin reaching into another plugin's internals, so
 * the dozen lines are replicated instead of shared. `plugins/system` and `plugins/assignments`
 * each record the same reasoning for their own copy.
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware is
 * installed in both compositions and is the only identity source a plugin may use: the legacy
 * `getRequestActor()` fell back to the raw `x-user-role` / `x-user-id` headers, which would let a
 * forged header outrank the middleware's verdict. If the middleware is missing this throws and
 * the request fails closed (500, no data) rather than degrading to headers.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

/**
 * The caller, as the kernel's request context resolved it.
 *
 * `studentId` / `classId` are the *resolved scope*, not something this plugin looks up: the host
 * fills them from the classroom plugin's published port (`api/app.ts` -> `resolveActorScope`). A
 * student carries their own row; a parent carries their first linked child. A teacher carries
 * neither - which class a teacher owns is a query concern this plugin answers from
 * `p_homework_assignments.teacher_id`, the ownership anchor it actually stores.
 */
export interface RequestActor {
  id: number | null;
  role: string | null;
  studentId: number | null;
  classId: number | null;
}

function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor
    ? {
        id: actor.userId,
        role: actor.role,
        studentId: actor.studentId ?? null,
        classId: actor.classId ?? null,
      }
    : { id: null, role: null, studentId: null, classId: null };
}

/** 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}

/** The caller without a role gate, for the read routes that serve several roles differently. */
export function requestActor(req: Request): RequestActor {
  return actorOf(req);
}

/** Planning and grading staff: the roles that create, own and grade homework. */
export const STAFF = ['teacher', 'admin', 'superadmin'];

/**
 * `GET /api/homework` and `GET /api/homework/:id`: staff plus the student the work is set for.
 *
 * A parent is deliberately absent - parent-facing homework reads go through the student's own
 * attempt (`GET /api/homework/submissions/:id`), which is the same child-scoped path the
 * classroom domain uses elsewhere. Listing the whole class for a parent would hand them every
 * other pupil's homework.
 */
export const CLASS_READERS = ['teacher', 'admin', 'superadmin', 'student'];

/** The per-student attempt reads: the student themselves, or the parent linked to that child. */
export const RECORD_READERS = ['teacher', 'admin', 'superadmin', 'student', 'parent'];

/**
 * `GET /api/homework/my` - the caller's *own* list, and therefore students and parents only.
 *
 * Staff are deliberately absent, and the service refuses them too. A teacher asking for "my
 * homework" is asking a question with no answer: the route is defined by the kernel-resolved
 * `studentId`, which a teacher does not carry, so a teacher would get a 403 from the service after
 * passing a role gate here. Excluding them here keeps that a refusal at the edge rather than a
 * contradiction between two layers, and the teacher's own list is `GET /api/homework`.
 */
export const MY_HOMEWORK_READERS = ['student', 'parent'];

/**
 * The routes only a student may call: starting an attempt, saving answers, uploading a photo
 * and submitting.
 *
 * Deliberately *not* staff. A teacher does not submit a pupil's homework for them, and the
 * service resolves `student_id` from the actor's own scope rather than from the body - which is
 * the whole reason the legacy `student_assignments` route could never work for a student: it was
 * gated to `teacher` while the page that called it ran as a student.
 */
export const STUDENT_ONLY = ['student'];

/** The write routes reserved for the teacher who owns the homework being written. */
export const TEACHER_WRITER = ['teacher', 'admin', 'superadmin'];
