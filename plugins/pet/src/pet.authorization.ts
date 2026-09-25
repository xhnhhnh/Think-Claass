/**
 * Request-level authorization for the pet domain, and the actor-scope questions its reads ask.
 *
 * Same shape as `plugins/system/src/system.authorization.ts`: 401 means "we do not know who you
 * are", 403 means "we know, and you may not". The identity comes from the kernel request context
 * and from nowhere else - the legacy `x-user-role` / `x-user-id` headers are client-supplied and
 * are not consulted even though `ALLOW_LEGACY_HEADER_AUTH` can turn them on for the bridge.
 *
 * ## Why the scope checks live here
 *
 * The matrix rules every read of this domain as "本人 / 孩子 / 本班", which cannot be answered from
 * the actor alone - it needs the classroom's membership data. `PetAuthorization` holds the
 * `classroom.public` port (this plugin already depends on classroom) and answers the three
 * questions the controllers ask. The teacher question uses `listClassIdsByTeacher` rather than a
 * `classes` read because classroom owns that table and this plugin must not know it.
 *
 * ## What is deliberately NOT here
 *
 * Field-level shape: which pet is returned, what a dashboard contains. This module decides only who
 * may ask, so it stays cheap to read and cannot drift from the service's own business rules.
 */

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import { ApiError, getRequestContext } from '@thinkclass/kernel';
import type { Request } from 'express';

/** The caller as this domain uses it. `studentId`/`classId` come from the host's scope resolver. */
export interface PetActor {
  id: number | null;
  role: string | null;
  studentId?: number;
  classId?: number;
}

const STAFF_ADMIN = ['admin', 'superadmin'];

/** Read the verified actor. Never falls back to headers. */
export function actorOf(req: Request): PetActor {
  const { actor } = getRequestContext(req);
  if (!actor) return { id: null, role: null };
  return { id: actor.userId, role: actor.role, studentId: actor.studentId, classId: actor.classId };
}

/** 401 unless the request carries a verified actor. */
export function requireActor(req: Request): PetActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  return actor;
}

/** 401 for an anonymous caller, 403 for a signed-in one whose role is not listed. */
export function requireActorRole(req: Request, allowedRoles: string[]): PetActor {
  const actor = requireActor(req);
  if (!allowedRoles.includes(actor.role as string)) {
    throw new ApiError(403, '无权限执行该操作');
  }
  return actor;
}

/**
 * The actor's scope, resolved against the classroom port.
 *
 * Kept separate from the shape checks above because it is the only part that touches the database,
 * and because every refusal it makes is a *membership* refusal - "this is not your child", "this is
 * not your class" - rather than a role refusal.
 */
export class PetAuthorization {
  constructor(private readonly classroom: ClassroomPort) {}

  isStaffAdmin(actor: PetActor): boolean {
    return actor.role !== null && STAFF_ADMIN.includes(actor.role);
  }

  /** Throw unless `actor` may read or act on this one student's pet. */
  async assertStudentAccess(actor: PetActor, studentId: number, message: string): Promise<void> {
    if (this.isStaffAdmin(actor)) return;
    if (actor.id === null || !actor.role) throw new ApiError(401, '未登录或登录已过期');

    if (actor.role === 'student') {
      // A student's own row, resolved by the kernel from their session - not from the path.
      if (actor.studentId === undefined) throw new ApiError(403, '当前账号未绑定学生');
      if (actor.studentId === studentId) return;
      throw new ApiError(403, message);
    }

    if (actor.role === 'parent') {
      const children = await this.classroom.listStudentsByParent(actor.id);
      if (children.some((child) => child.id === studentId)) return;
      throw new ApiError(403, message);
    }

    if (actor.role === 'teacher') {
      const classId = await this.classroom.getClassIdByStudentId(studentId);
      const owned = await this.classroom.listClassIdsByTeacher(actor.id);
      if (classId && owned.includes(classId)) return;
      throw new ApiError(403, message);
    }

    throw new ApiError(403, message);
  }

  /** Throw unless `actor` may read this class's pets. */
  async assertClassAccess(actor: PetActor, classId: number, message: string): Promise<void> {
    if (this.isStaffAdmin(actor)) return;
    if (actor.id === null || !actor.role) throw new ApiError(401, '未登录或登录已过期');

    if (actor.role === 'teacher') {
      const owned = await this.classroom.listClassIdsByTeacher(actor.id);
      if (owned.includes(classId)) return;
      throw new ApiError(403, message);
    }

    if (actor.role === 'student') {
      // The class the student actually belongs to, not the one in the path.
      if (actor.studentId === undefined) throw new ApiError(403, '当前账号未绑定学生');
      const own = await this.classroom.getClassIdByStudentId(actor.studentId);
      if (own && own === classId) return;
      throw new ApiError(403, message);
    }

    if (actor.role === 'parent') {
      const children = await this.classroom.listStudentsByParent(actor.id);
      for (const child of children) {
        const own = await this.classroom.getClassIdByStudentId(child.id);
        if (own === classId) return;
      }
      throw new ApiError(403, message);
    }

    throw new ApiError(403, message);
  }
}
