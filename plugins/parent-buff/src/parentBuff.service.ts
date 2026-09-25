/**
 * Parent-buff service.
 *
 * Records one explicit blessing per student per Asia/Shanghai day.
 *
 * `ApiError` now comes from the kernel rather than `api/utils/apiError.js`, because a plugin
 * may not import `api/**` - and `instanceof` does not hold across those two classes anyway.
 *
 * ## Authorization (added with the route-hardening round)
 *
 * The write is a claim about a *family*: it records that a parent was active with one of their
 * students, and the classroom may grant a class-configured teacher-score bonus. Who may make that claim
 * is therefore decided from the actor, not from the request: a parent may bless one of their own
 * children, and the check resolves the parent/child link through `classroom.public` (the port that
 * owns `parent_students`) rather than trusting `Actor.studentId`, which is a host-supplied hint and
 * single-valued for a parent with several children.
 */

import { ApiError } from '@thinkclass/kernel';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { SqlParam } from '@thinkclass/plugin-sdk';

import type { RequestActor } from './parentBuff.authorization.js';
import type { ParentBuffRepository } from './parentBuff.repository.js';

/**
 * Classroom reads used to verify ownership and the class feature switch.
 */
export type ParentBuffClassroom = Pick<ClassroomPort, 'listStudentsByParent' | 'getStudentById' | 'getClassById' | 'checkStudentFeature'>;

export class ParentBuffService {
  constructor(
    private readonly repository: ParentBuffRepository,
    private readonly classroom: ParentBuffClassroom,
  ) {}

  /**
   * 403 unless the actor may record a blessing for this student.
   *
   * A parent may bless their own child, and a teacher may bless only a student in their class.
   * The classroom's feature switch must also allow blessings.
   */
  async assertActorMayBless(actor: RequestActor, studentId: unknown): Promise<void> {
    if (actor.id === null) throw new ApiError(403, '无权限执行该操作');
    const id = Number(studentId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, 'Student ID required');
    if (actor.role === 'parent') {
      const children = await this.classroom.listStudentsByParent(actor.id);
      if (!children.some((child) => child.id === id)) throw new ApiError(403, '无权限执行该操作');
    } else if (actor.role === 'teacher') {
      const student = await this.classroom.getStudentById(id);
      const classInfo = student ? await this.classroom.getClassById(student.classId) : null;
      if (!classInfo || classInfo.teacherId !== actor.id) throw new ApiError(403, '无权限执行该操作');
    } else {
      throw new ApiError(403, '无权限执行该操作');
    }
    const feature = await this.classroom.checkStudentFeature(id, 'enable_parent_buff');
    if (feature.refusal) throw new ApiError(403, feature.refusal.message);
  }

  createParentBuff(input: { studentId?: unknown }) {
    const { studentId } = input ?? {};
    if (!studentId) {
      throw new ApiError(400, 'Student ID required');
    }

    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type: 'year' | 'month' | 'day') => parts.find((entry) => entry.type === type)?.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    if (this.repository.findToday(studentId as SqlParam, today)) {
      throw new ApiError(400, '今日已经施放过祝福了');
    }

    this.repository.insert(studentId as SqlParam);
  }

  /**
   * Record that a parent was active with one of their students today.
   *
   * Published as `parent-buff.public` so the identity domain stops writing `parent_activity`
   * itself. The rule is the pre-migration one from `auth.service.login`: upsert on
   * `(parent_id, student_id)`, set `last_active_date`. No validation and no error path - the
   * legacy call site wrapped it in `if (student)` and ignored nothing else, so this method is a
   * straight write. `day` comes from the caller so the port does not invent a second clock.
   */
  touchParentLogin(parentId: number, studentId: number, day: string): void {
    this.repository.upsertParentLogin(parentId, studentId, day);
  }
}
