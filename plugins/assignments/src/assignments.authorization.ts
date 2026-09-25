/**
 * Request-level authorization for the `api/assignments` + `api/exams` surface.
 *
 * Every one of this plugin's fourteen routes used to be anonymous: the matrix recorded them all
 * as 无鉴权 (`docs/security/route-authorization-matrix.md`, the assignments table) - anyone could
 * read any class's assignments and grade sheet by `class_id`, and anyone could create, edit or
 * delete them. Each handler now resolves the caller first and the service beneath it narrows what
 * the caller may see or touch to what the actor owns.
 *
 * The semantics are the fixed split used across the round:
 *
 *   401 - "we do not know who you are"  (`未登录或登录已过期`)
 *   403 - "we know, and you may not"    (`无权限执行该操作`)
 *
 * The helper is defined here rather than imported from `plugins/learning` or `plugins/system`:
 * guardrail G1 forbids a plugin reaching into another plugin's internals, so the ten lines are
 * replicated instead of shared. The same reasoning `plugins/system/src/system.authorization.ts`
 * records for its own copy.
 *
 * The caller comes from the kernel's request context and from nowhere else. That middleware is
 * installed in both compositions and is the only identity source a plugin may use: the legacy
 * `getRequestActor()` fell back to the raw `x-user-role` / `x-user-id` headers, which would let a
 * forged header outrank the middleware's verdict. If the middleware is missing this throws and the
 * request fails closed (500, no data) rather than degrading to headers.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

/**
 * The caller, as the kernel's request context resolved it.
 *
 * `studentId` / `classId` are the *resolved scope*, not something this plugin looks up: the host
 * fills them from the classroom plugin's published port (`api/app.ts` -> `resolveActorScope`). A
 * student carries their own row; a parent carries their first linked child. A teacher does not
 * carry a class - which class a teacher owns is a query concern this plugin answers from
 * `assignments.teacher_id` / `exams.teacher_id`, the ownership anchors it actually stores.
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

/** The legacy `requireActorRole`: 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}

/** Planning and grading staff: the roles that create and own assignments and exams. */
export const STAFF = ['teacher', 'admin', 'superadmin'];

/**
 * `GET /api/assignments`: staff plus the student the work is set for.
 *
 * A parent is deliberately absent - the matrix rules the class assignment list as
 * teacher/admin（限本班）or student（本班）. A parent reads their child's own rows through
 * `GET /api/assignments/student-assignments` instead.
 */
export const CLASS_READERS = ['teacher', 'admin', 'superadmin', 'student'];

/**
 * The per-student record reads (`student-assignments`, `student-exams`).
 *
 * teacher（本班）/student（本人）/parent（孩子）: the teacher's scope comes from the assignment or
 * exam they own, and a student/parent scope from the resolved `studentId` - never from the query.
 */
export const RECORD_READERS = ['teacher', 'student', 'parent'];

/** The write routes the matrix reserves for the teacher who owns the row being written. */
export const TEACHER = ['teacher'];
