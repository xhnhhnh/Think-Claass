/**
 * Assignments + exams services.
 *
 * Behavior is relocated from `api/modules/learning/assignments.service.ts` and
 * `exams.service.ts` unchanged: the same validation order, the same messages, and the
 * same `{ id }` / `{ updated: true }` / `{ deleted: true }` / `{ saved: true }` return
 * shapes.
 *
 * The only import that changed is `ApiError`: the deleted services used
 * `api/utils/apiError.js`, which is a *different class* from the kernel's, so
 * `instanceof` would not hold across the boundary. A plugin throws the kernel's.
 *
 * ## Authorization changed, deliberately
 *
 * Every method now takes the caller the controller resolved from the kernel's request context
 * (401/403 role gates live in `assignments.authorization.ts`, so a refusal happens before any
 * validation message), and narrows what it reads or writes to what that caller owns:
 *
 *   - a teacher to the rows carrying their own `teacher_id` - the ownership anchor these tables
 *     actually store, which is also how "本班" is expressed here;
 *   - a student or parent to the `studentId` / `classId` the kernel resolved for the login, with a
 *     query naming someone else refused rather than silently ignored;
 *   - admin / superadmin to everything.
 *
 * `teacher_id` on a create is derived from the actor and the body's copy is discarded: the legacy
 * path trusted `input.teacher_id`, so an authenticated teacher could file work under a colleague's
 * name - and a fabricated caller needed no identity at all.
 *
 * A missing row on `updateAssignment` / `deleteAssignment` / `updateStudentAssignment` keeps the
 * legacy silent no-op (`{updated: true}` / `{deleted: true}` with no statement matching). That is
 * not authorization-relevant: there is nothing to read and nothing to write, and it keeps the
 * response shape the deployed frontend was written against. Every path that *can* touch data
 * resolves the row first.
 */

import { ApiError } from '@thinkclass/kernel';
import type {
  Assignment,
  AssignmentPayload,
  Exam,
  ExamPayload,
  SaveExamGradePayload,
  StudentAssignmentUpdatePayload,
} from '@thinkclass/contracts/domains/learning';

import type { RequestActor } from './assignments.authorization.js';
import type { AssignmentsRepository, ExamsRepository } from './assignments.repository.js';

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new ApiError(400, `${label} is invalid`);
  return number;
}

function positiveInteger(value: unknown, label: string) {
  const number = optionalPositiveInteger(value, label);
  if (number === undefined) throw new ApiError(400, `${label} is invalid`);
  return number;
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ApiError(400, `${label} is invalid`);
  return number;
}

/** The roles that own every row: the platform operator's escape hatch. */
function isAdminRole(actor: RequestActor): boolean {
  return actor.role === 'admin' || actor.role === 'superadmin';
}

/**
 * The actor's user id, or 401.
 *
 * The controllers already refuse an anonymous caller, so this is the service-level belt for the
 * direct callers (tests, a future non-HTTP caller): it fails closed instead of letting a `null`
 * id become the `teacher_id` of a new row.
 */
function requireActorId(actor: RequestActor): number {
  if (actor.id === null || !Number.isFinite(actor.id)) throw new ApiError(401, '未登录或登录已过期');
  return actor.id;
}

/**
 * The student row this login owns: a student's own, or the child a parent is linked to.
 *
 * Resolved by the kernel (`api/app.ts` -> `resolveActorScope`), never from the request.
 */
function requireOwnStudentId(actor: RequestActor, message: string): number {
  if (actor.studentId === null || !Number.isFinite(actor.studentId)) throw new ApiError(403, message);
  return actor.studentId;
}

/** The class that student sits in, also from the kernel-resolved scope. */
function requireOwnClassId(actor: RequestActor): number {
  if (actor.classId === null || !Number.isFinite(actor.classId)) throw new ApiError(403, '当前账号未绑定班级');
  return actor.classId;
}

export class AssignmentsService {
  constructor(private readonly repository: AssignmentsRepository) {}

  /** 403 unless the actor is the teacher who owns this assignment; admin/superadmin always pass. */
  private ensureAssignmentOwner(actor: RequestActor, assignment: Assignment, message: string): void {
    if (isAdminRole(actor)) return;
    if (actor.role !== 'teacher' || actor.id === null || assignment.teacher_id !== actor.id) {
      throw new ApiError(403, message);
    }
  }

  /**
   * `GET /api/assignments` - teacher/admin（限本班）, student（本班）.
   *
   * The class filter comes from the actor for a student and intersects with the teacher's own
   * rows for a teacher, so a `class_id` naming a class the caller has no claim on cannot widen the
   * answer. Deliberately *not* a call to `classroom`: this plugin reads students and no class
   * ownership table, and `assignments.teacher_id` is the claim these rows carry.
   *
   * The matrix's student clause reads 本班已发布, but `assignments` has no `status`/`published`
   * column (unlike `papers`), so the class is the whole of the student's filter - there is nothing
   * else to read. Stated here rather than silently skipped.
   */
  listAssignments(actor: RequestActor, classIdInput?: unknown) {
    const classId = optionalPositiveInteger(classIdInput, 'class_id');

    if (isAdminRole(actor)) {
      return this.repository.listAssignments({ classId });
    }

    if (actor.role === 'teacher') {
      return this.repository.listAssignments({ classId, teacherId: requireActorId(actor) });
    }

    if (actor.role === 'student') {
      const ownClass = requireOwnClassId(actor);
      if (classId !== undefined && classId !== ownClass) throw new ApiError(403, '无权限查看该班级作业');
      return this.repository.listAssignments({ classId: ownClass });
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  /**
   * `POST /api/assignments` - teacher/admin.
   *
   * `teacher_id` is the actor's id. A body copy is ignored, not validated: it is not a claim the
   * caller is allowed to make.
   */
  createAssignment(actor: RequestActor, input: AssignmentPayload) {
    const classId = positiveInteger(input.class_id, 'class_id');
    const teacherId = requireActorId(actor);
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');
    return {
      id: this.repository.createAssignment({
        ...input,
        class_id: classId,
        teacher_id: teacherId,
        title: input.title.trim(),
      }),
    };
  }

  /**
   * `PUT /api/assignments/:id` - teacher（作业归属者）/admin.
   *
   * A missing row keeps the legacy no-op: the legacy statement matched nothing and answered
   * `{updated: true}`. When the row exists the owner is checked before the write.
   */
  updateAssignment(actor: RequestActor, idInput: unknown, input: Partial<AssignmentPayload>) {
    const id = positiveInteger(idInput, 'id');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');

    const existing = this.repository.getAssignment(id);
    if (existing) this.ensureAssignmentOwner(actor, existing, '无权限修改该作业');

    this.repository.updateAssignment(id, input);
    return { updated: true };
  }

  /** `DELETE /api/assignments/:id` - teacher（作业归属者）/admin. Same missing-row no-op. */
  deleteAssignment(actor: RequestActor, idInput: unknown) {
    const id = positiveInteger(idInput, 'id');

    const existing = this.repository.getAssignment(id);
    if (existing) this.ensureAssignmentOwner(actor, existing, '无权限删除该作业');

    this.repository.deleteAssignment(id);
    return { deleted: true };
  }

  /**
   * `GET /api/assignments/student-assignments` - teacher（本班）/student（本人）/parent（孩子）.
   *
   * `student_id` / `assignment_id` from the query are not trusted: a student or parent is pinned
   * to the resolved `studentId` (and a query naming another student is a 403, not an empty list),
   * and a teacher's answer is restricted to their own assignments by SQL before the query filters
   * apply.
   */
  listStudentAssignments(actor: RequestActor, input: { student_id?: unknown; assignment_id?: unknown }) {
    const studentId = optionalPositiveInteger(input.student_id, 'student_id');
    const assignmentId = optionalPositiveInteger(input.assignment_id, 'assignment_id');

    if (actor.role === 'teacher') {
      return this.repository.listStudentAssignments({
        studentId,
        assignmentId,
        teacherId: requireActorId(actor),
      });
    }

    if (actor.role === 'student' || actor.role === 'parent') {
      const own = requireOwnStudentId(actor, '当前账号未绑定学生');
      if (studentId !== undefined && studentId !== own) throw new ApiError(403, '无权限查看该学生的作业');
      return this.repository.listStudentAssignments({ studentId: own, assignmentId });
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  /**
   * `PUT /api/assignments/student-assignments/:id` - teacher（本班）.
   *
   * The row's parent assignment is the ownership anchor; a row whose parent is gone is refused
   * rather than written (fail closed).
   */
  updateStudentAssignment(actor: RequestActor, idInput: unknown, input: StudentAssignmentUpdatePayload) {
    const id = positiveInteger(idInput, 'id');
    if (!input || Object.keys(input).length === 0) throw new ApiError(400, 'No fields to update');

    const record = this.repository.getStudentAssignment(id);
    if (record) {
      const assignment = this.repository.getAssignment(record.assignment_id);
      if (!assignment) throw new ApiError(403, '无权限修改该学生作业');
      this.ensureAssignmentOwner(actor, assignment, '无权限修改该学生作业');
    }

    this.repository.updateStudentAssignment(id, input);
    return { updated: true };
  }
}

export class ExamsService {
  constructor(private readonly repository: ExamsRepository) {}

  /** 403 unless the actor is the teacher who owns this exam; admin/superadmin always pass. */
  private ensureExamOwner(actor: RequestActor, exam: Exam, message: string): void {
    if (isAdminRole(actor)) return;
    if (actor.role !== 'teacher' || actor.id === null || exam.teacher_id !== actor.id) {
      throw new ApiError(403, message);
    }
  }

  /** `GET /api/exams` - teacher/admin（本班）. The teacher sees their own exams only. */
  listExams(actor: RequestActor, classIdInput?: unknown) {
    const classId = optionalPositiveInteger(classIdInput, 'class_id');

    if (isAdminRole(actor)) {
      return this.repository.listExams({ classId });
    }

    if (actor.role === 'teacher') {
      return this.repository.listExams({ classId, teacherId: requireActorId(actor) });
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  /**
   * Creating an exam also creates one empty `student_exams` row per student in the class,
   * inside one transaction. `listStudentIds` reads the classroom-owned `students` table;
   * the manifest declares it as a read.
   *
   * `teacher_id` is derived from the actor - a body copy could previously file the exam under a
   * colleague's name, and an anonymous caller needed no name at all.
   */
  createExam(actor: RequestActor, input: ExamPayload) {
    const classId = positiveInteger(input.class_id, 'class_id');
    const teacherId = requireActorId(actor);
    const totalScore = positiveNumber(input.total_score, 'total_score');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');

    const id = this.repository.transaction(() => {
      const examId = this.repository.createExam({
        ...input,
        class_id: classId,
        teacher_id: teacherId,
        title: input.title.trim(),
        total_score: totalScore,
      });
      for (const student of this.repository.listStudentIds(classId)) {
        this.repository.createStudentExam(examId, student.id);
      }
      return examId;
    });

    return { id };
  }

  /** `GET /api/exams/:id/grades` - teacher（试卷归属者）/admin: the whole class's grade sheet. */
  getGrades(actor: RequestActor, idInput: unknown) {
    const id = positiveInteger(idInput, 'id');
    const exam = this.repository.getExam(id);
    if (!exam) throw new ApiError(404, 'Exam not found');
    this.ensureExamOwner(actor, exam, '无权限查看该考试成绩');
    return { exam, grades: this.repository.listGrades(id) };
  }

  /** `PUT /api/exams/:id/grades` - teacher（试卷归属者）: a bulk rewrite of the grade sheet. */
  saveGrades(actor: RequestActor, idInput: unknown, gradesInput: SaveExamGradePayload[]) {
    const id = positiveInteger(idInput, 'id');
    const exam = this.repository.getExam(id);
    if (!exam) throw new ApiError(404, 'Exam not found');
    this.ensureExamOwner(actor, exam, '无权限修改该考试成绩');
    if (!Array.isArray(gradesInput) || gradesInput.length === 0) throw new ApiError(400, 'Missing grades');

    this.repository.transaction(() => {
      for (const grade of gradesInput) {
        const studentId = positiveInteger(grade.student_id, 'student_id');
        const score =
          grade.score === null || grade.score === undefined || String(grade.score) === ''
            ? null
            : Number(grade.score);
        if (score !== null && (!Number.isFinite(score) || score < 0)) throw new ApiError(400, 'Invalid score');
        this.repository.upsertGrade(id, { student_id: studentId, score, feedback: grade.feedback ?? null });
      }
    });

    return { saved: true };
  }

  /** `PUT /api/exams/:id` - teacher（归属者）/admin. */
  updateExam(actor: RequestActor, idInput: unknown, input: Partial<ExamPayload>) {
    const id = positiveInteger(idInput, 'id');
    const exam = this.repository.getExam(id);
    if (!exam) throw new ApiError(404, 'Exam not found');
    this.ensureExamOwner(actor, exam, '无权限修改该考试');
    if (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim())) {
      throw new ApiError(400, 'Invalid title');
    }
    if (input.total_score !== undefined) positiveNumber(input.total_score, 'total_score');
    this.repository.updateExam(id, input);
    return { updated: true };
  }

  /** `DELETE /api/exams/:id` - teacher（归属者）/admin. */
  deleteExam(actor: RequestActor, idInput: unknown) {
    const id = positiveInteger(idInput, 'id');
    const exam = this.repository.getExam(id);
    if (!exam) throw new ApiError(404, 'Exam not found');
    this.ensureExamOwner(actor, exam, '无权限删除该考试');
    this.repository.deleteExam(id);
    return { deleted: true };
  }

  /**
   * `GET /api/exams/student-exams` - teacher（本班）/student（本人）/parent（孩子）.
   *
   * Grades are student PII, so the query is a filter on top of the actor's scope, never the scope
   * itself: a teacher reads only rows of their own exams, a student/parent only the resolved
   * student's rows.
   */
  listStudentExams(actor: RequestActor, input: { student_id?: unknown; exam_id?: unknown }) {
    const studentId = optionalPositiveInteger(input.student_id, 'student_id');
    const examId = optionalPositiveInteger(input.exam_id, 'exam_id');

    if (actor.role === 'teacher') {
      return this.repository.listStudentExams({ studentId, examId, teacherId: requireActorId(actor) });
    }

    if (actor.role === 'student' || actor.role === 'parent') {
      const own = requireOwnStudentId(actor, '当前账号未绑定学生');
      if (studentId !== undefined && studentId !== own) throw new ApiError(403, '无权限查看该学生的成绩');
      return this.repository.listStudentExams({ studentId: own, examId });
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  /** `PUT /api/exams/student-exams/:id` - teacher（本班）: the row's exam is the anchor. */
  updateStudentExam(actor: RequestActor, idInput: unknown, input: { score: number | null; feedback?: string | null }) {
    const id = positiveInteger(idInput, 'id');
    const record = this.repository.getStudentExamById(id);
    if (!record) throw new ApiError(404, 'Student exam record not found');
    const exam = this.repository.getExam(record.exam_id);
    if (!exam) throw new ApiError(403, '无权限修改该学生成绩');
    this.ensureExamOwner(actor, exam, '无权限修改该学生成绩');

    const score =
      input.score === null || input.score === undefined || String(input.score) === '' ? null : Number(input.score);
    if (score !== null && (!Number.isFinite(score) || score < 0)) throw new ApiError(400, 'Invalid score');
    this.repository.updateStudentExam(id, { score, feedback: input.feedback ?? null });
    return { updated: true };
  }
}
