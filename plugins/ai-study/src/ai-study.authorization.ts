/**
 * ai-study authorization - who may ask about a student, and who may see a class.
 *
 * Two layers, the same split `plugins/pet` uses:
 *
 *   1. **Role gates** (`requireActor` / `requireActorRole`), which fire *before* any validation and
 *      answer 401 未登录或登录已过期 for an unknown caller and 403 无权限执行该操作 for a known one
 *      whose role the route does not list. The actor comes from the kernel request context only -
 *      the legacy `x-user-role` / `x-user-id` headers are never consulted, so a request that the
 *      kernel did not authenticate is anonymous here whatever it claims.
 *   2. **Membership gates** (`AiStudyAuthorization`), which need the database and answer questions
 *      the role cannot: is this student the caller's own row, is this class theirs. Every one of
 *      them goes through `classroom.public`, because `students` and `classes` belong to the
 *      classroom plugin (guardrail G1).
 *
 * A student's own row is never taken from the path. The student routes carry no `:studentId` at all
 * - the caller's student comes from `classroom.public.getStudentByUserId(actor.userId)`, and a path
 * parameter would be a second, forgeable way to name one.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';
import type { ClassroomPort, ClassroomRefusal } from '@thinkclass/contracts/domains/classroom';

export interface AiStudyActor {
  id: number | null;
  role: string | null;
  /** Filled by the host's scope resolver; present for students and parents. */
  studentId?: number;
  classId?: number;
}

/** Roles that own a class's teaching surface. */
export const STAFF = ['teacher', 'admin', 'superadmin'];

/** The admin console, which reaches every class. */
const STAFF_ADMIN = ['admin', 'superadmin'];

/**
 * The class feature flag this whole domain hangs off.
 *
 * The legacy `enable_*` spelling, because that is what `classroom.public.checkStudentFeature` takes:
 * the port maps it to the `classroom.enable_ai_study` capability and falls back to the
 * `classes.enable_ai_study` column.
 */
export const FEATURE_KEY = 'enable_ai_study';

/**
 * The port's refusal codes, mapped to the statuses the rest of the API answers with.
 *
 * `classroom.public` cannot throw the kernel's `ApiError` (the contracts package is type-only,
 * guardrail G6), so it returns a code and the caller decides. The spellings are the ones
 * the classroom domain already uses, so a class with the feature switched off reads the same here as
 * it does in every other feature plugin.
 */
export function refusalToApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal?.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    default:
      return new ApiError(403, refusal?.message || '无权限执行该操作');
  }
}

/** Read the verified actor. Never falls back to headers. */
export function actorOf(req: Request): AiStudyActor {
  const { actor } = getRequestContext(req);
  if (!actor) return { id: null, role: null };
  return { id: actor.userId, role: actor.role, studentId: actor.studentId, classId: actor.classId };
}

/** 401 unless the request carries a verified actor. */
export function requireActor(req: Request): AiStudyActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  return actor;
}

/** 401 for an anonymous caller, 403 for a signed-in one whose role is not listed. */
export function requireActorRole(req: Request, allowedRoles: string[]): AiStudyActor {
  const actor = requireActor(req);
  if (!allowedRoles.includes(actor.role as string)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}

export class AiStudyAuthorization {
  constructor(private readonly classroom: ClassroomPort) {}

  isStaffAdmin(actor: AiStudyActor): boolean {
    return actor.role !== null && STAFF_ADMIN.includes(actor.role);
  }

  /**
   * The student behind a student actor.
   *
   * 403 rather than 404 when there is no bound `students` row: the account is real and permitted to
   * call the route, it simply has no student attached, and saying "not found" would send the user
   * looking for a missing record instead of at their own account setup. This is the wording
   * `plugins/pet` already answers for the same situation.
   */
  async requireOwnStudent(actor: AiStudyActor): Promise<{ id: number; classId: number }> {
    if (actor.id === null) throw new ApiError(401, '未登录或登录已过期');
    const student = await this.classroom.getStudentByUserId(actor.id);
    if (!student) throw new ApiError(403, '当前账号未绑定学生');
    return { id: student.id, classId: student.classId };
  }

  /** Throw unless the class feature `enable_ai_study` is on for this student's class. */
  async assertStudentFeature(studentId: number): Promise<void> {
    const gate = await this.classroom.checkStudentFeature(studentId, FEATURE_KEY);
    if (gate.refusal) throw refusalToApiError(gate.refusal);
  }

  /** Throw unless the class feature `enable_ai_study` is on for this class. */
  async assertClassFeature(classId: number): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, FEATURE_KEY);
    if (gate.refusal) throw refusalToApiError(gate.refusal);
  }

  /**
   * Throw unless `actor` owns this class (or is an admin).
   *
   * `listClassIdsByTeacher` rather than `getClassById(...).teacherId === actor.id`, because a
   * teacher's ownership is a *set* in this system and comparing a single row would be a second
   * definition of it.
   */
  async assertClassAccess(actor: AiStudyActor, classId: number, message: string): Promise<void> {
    if (this.isStaffAdmin(actor)) return;
    if (actor.id === null || !actor.role) throw new ApiError(401, '未登录或登录已过期');
    if (actor.role !== 'teacher') throw new ApiError(403, message);

    const owned = await this.classroom.listClassIdsByTeacher(actor.id);
    if (owned.includes(classId)) return;
    throw new ApiError(403, message);
  }

  /** Throw unless this student is in this class - the check a dispatch makes per student id. */
  async assertStudentInClass(studentId: number, classId: number): Promise<void> {
    const actual = await this.classroom.getClassIdByStudentId(studentId);
    if (actual !== classId) throw new ApiError(403, '该学生不在本班');
  }
}
