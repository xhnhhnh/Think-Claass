/**
 * Classroom service - the HTTP surface's business logic, moved out of
 * `api/modules/classroom/classroom.service.ts` unchanged.
 *
 * Every method here is a port of the legacy one. The three things that did change are the
 * ones the plugin boundary forces:
 *
 *   * data access goes through one repository (`ctx.db` for the tables this plugin owns or
 *     has declared as reads, `ctx.rawDb` for the enumerated foreign writes - see the
 *     repository header);
 *   * `decrypt()` / `hashPassword()` come from the host (`ctx.config.decryptName`) and the
 *     kernel (`@thinkclass/kernel`) instead of `api/db.ts` / `api/utils/password.ts`;
 *   * the actor comes from the kernel's verified request context, with the legacy header
 *     bridge kept as the fallback (the logic `api/utils/requestAuth.ts` implemented).
 *
 * Deliberately *not* changed: none of these routes emit `classroom.student.points.changed`.
 * The port emits it because other plugins depend on learning about point moves; the legacy
 * HTTP service never did, and adding events here would make this migration observably
 * different for subscribers. The port's `adjustPoints` remains the emitting path, and
 * `PetService` etc. keep consuming it.
 *
 * Authorization is the one behaviour this file *did* change. Every route resolves the caller
 * with `requireActor` - 401 for an anonymous request, before any validation message - and then
 * narrows what it reads or writes to what the role owns: a teacher's own classes, a student's
 * own row, a parent's linked children, everything for admin/superadmin. The helpers live in the
 * "actor scope" section below and reuse the repository reads the account-deletion scope already
 * had, so "may this actor touch this class/student" has one answer. `GET /api/classes/invite/:code`
 * is the deliberate exception and stays public: the activation page calls it before login.
 *
 * The error contract is the kernel `ApiError` (status + message). The controllers translate
 * nothing; the kernel's global filter renders `{success:false, message}` on the wire, which
 * is what the legacy `HttpException` produced.
 */

import { randomInt } from 'node:crypto';

import { ApiError, hashPassword } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { ClassFeatureResolver } from './classroom.features.js';
import type { ClassroomRepository } from './classroom.repository.js';
import { requestActor, type NameCipher } from './classroom.support.js';
import type {
  ClassRow,
  CreatedStudent,
  CreateStudentAccountInput,
  LedgerRow,
  RequestActor,
  StudentDetailRow,
  StudentRow,
} from './classroom.types.js';

/** Type of the `request` a controller hands over; only `header()` is used. */
type ServiceRequest = Parameters<typeof requestActor>[0];

/**
 * A six-character class invite code, drawn from the same base-36 alphabet the legacy codes used.
 *
 * `Math.random().toString(36).substring(2, 8).toUpperCase()` was the old source: not a CSPRNG, and
 * not reliably six characters - a short base-36 fraction produced a shorter code. An invite code is
 * a join credential for a class, so it now comes from `crypto.randomInt`. `api/db.ts` generates the
 * backfill codes for code-less classes the same way; a plugin may not import `api/**`, so the two
 * small helpers are deliberately parallel.
 */
const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

export class ClassroomService {
  constructor(
    private readonly repository: ClassroomRepository,
    private readonly features: ClassFeatureResolver,
    private readonly cipher: NameCipher,
    private readonly ctx: KernelContext,
  ) {}

  // -- helpers ported from api/services/* ----------------------------------

  private normalizeId(value: unknown, label: string): number {
    const id = Number(value);
    if (!Number.isFinite(id)) {
      throw new ApiError(400, `Invalid ${label}`);
    }
    return id;
  }

  private getStudentOrThrow(studentId: unknown): StudentRow {
    const id = this.normalizeId(studentId, 'student');
    const student = this.repository.findStudentRow(id);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return student;
  }

  private resolveDefaultClassId(classId?: unknown): number {
    if (classId) {
      return this.normalizeId(classId, 'class');
    }
    const defaultClass = this.repository.firstClassId();
    return defaultClass?.id ?? 1;
  }

  /** `createStudentAccount` from `api/services/studentService.ts`. */
  private createStudentAccount(input: CreateStudentAccountInput): CreatedStudent {
    // `.trim()` on the raw value on purpose: the legacy helper threw for a non-string
    // username, and `batchImport` skips only *falsy* values.
    const baseUsername = (input.username as string).trim();
    const studentName = (input.name as string).trim();

    if (!baseUsername || !studentName) {
      throw new ApiError(400, '请填写学生姓名和用户名');
    }

    const classId = this.resolveDefaultClassId(input.classId);
    let finalUsername = baseUsername;

    if (input.allowUsernameSuffix) {
      let suffix = 1;
      while (this.repository.usernameExists(finalUsername)) {
        finalUsername = `${baseUsername}${suffix}`;
        suffix++;
      }
    }

    const userId = this.repository.insertUser(finalUsername, hashPassword(input.initialPassword ?? '123456'));
    const studentId = this.repository.insertStudent(userId, classId, this.cipher.encrypt(studentName));

    return {
      id: studentId,
      user_id: userId,
      username: finalUsername,
      class_id: classId,
      name: studentName,
    };
  }

  /** `revivePetIfPresent` from `api/services/pointsService.ts`. */
  private revivePetIfPresent(studentId: number): void {
    try {
      this.repository.touchPetFedAt(studentId, 'current-timestamp');
    } catch {
      // Older databases may not have the pet activity columns yet.
    }
  }

  /** `adjustStudentPoints` from `api/services/pointsService.ts`. */
  private adjustStudentPoints(
    studentId: unknown,
    amount: number,
    description: string,
    options: { recordType?: string; revivePetOnPositive?: boolean } = {},
  ): { total_points: number; available_points: number } {
    if (!Number.isFinite(amount)) {
      throw new ApiError(400, 'Invalid amount');
    }

    const student = this.getStudentOrThrow(studentId);
    const newTotal = amount > 0 ? (student.total_points as number) + amount : (student.total_points as number);
    const newAvailable = (student.available_points as number) + amount;
    if (newAvailable < 0) throw new ApiError(400, '可用积分不足，不能扣分');

    this.repository.setStudentPoints(student.id, newTotal, newAvailable);
    this.repository.insertRecord(
      student.id,
      options.recordType ?? (amount > 0 ? 'ADD_POINTS' : 'DEDUCT_POINTS'),
      amount,
      description,
    );

    if (options.revivePetOnPositive && amount > 0) {
      this.revivePetIfPresent(student.id);
    }

    return { total_points: newTotal, available_points: newAvailable };
  }

  /** Teacher scoring is a single transaction: balance, ledger and rule event agree. */
  private scoreStudent(studentId: number, requested: number, reason: string, requestId?: string) {
    if (!Number.isInteger(requested) || requested === 0 || requested < -5 || requested > 5) {
      throw new ApiError(400, '每次评分须为 −5 至 +5 的非零整数');
    }
    if (requestId && (typeof requestId !== 'string' || requestId.length > 100)) {
      throw new ApiError(400, '无效请求标识');
    }
    const prior = requestId ? this.repository.findPointEvent(studentId, requestId) : undefined;
    if (prior) {
      if (prior.source !== 'teacher_score' || Number(prior.requested_delta) !== requested) {
        throw new ApiError(409, '请求标识已用于另一项评分');
      }
      const applied = Number(prior.credits_delta);
      const bonus = Math.max(0, applied - Number(prior.growth_delta));
      return { studentId, applied, bonus, total_points: Number(prior.growth_balance), available_points: Number(prior.credits_balance), replayed: true };
    }

    const student = this.getStudentOrThrow(studentId);
    const today = this.repository.teacherPositiveToday(studentId);
    const base = requested > 0 ? Math.min(requested, Math.max(0, 20 - today.base)) : requested;
    if (base === 0) throw new ApiError(400, '该学生今日教师正向评分已达 20 分上限');
    const policy = this.repository.incentivePolicy(student.class_id);
    const hasBlessing = requested > 0 && this.features.getClassFeaturesByClassId(student.class_id).enable_parent_buff
      && this.repository.hasParentActivityShanghaiToday(studentId);
    const bonus = hasBlessing ? Math.min(Math.ceil(base * policy.parent_bonus_percent / 100), Math.max(0, 2 - today.bonus)) : 0;
    const applied = base + bonus;
    const total = (student.total_points ?? 0) + Math.max(0, base);
    const available = (student.available_points ?? 0) + applied;
    if (available < 0) throw new ApiError(400, '可用积分不足，不能扣分');
    this.repository.setStudentPoints(studentId, total, available);
    const recordId = this.repository.insertRecord(studentId, applied > 0 ? 'ADD_POINTS' : 'DEDUCT_POINTS', applied, reason);
    this.repository.insertPointEvent({ studentId, recordId, requestId, source: 'teacher_score', category: 'growth', growth: Math.max(0, base), credits: applied, requested, total, available });
    if (applied > 0) this.revivePetIfPresent(studentId);
    return { studentId, applied, bonus, total_points: total, available_points: available, replayed: false };
  }

  /** `addStudentPoints` from `api/services/pointsService.ts`. */
  private addStudentPoints(
    studentId: unknown,
    amount: number,
    recordType: string,
    description: string,
  ): { total_points: number; available_points: number } {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'Invalid amount');
    }

    const student = this.getStudentOrThrow(studentId);
    const newTotal = (student.total_points as number) + amount;
    const newAvailable = (student.available_points as number) + amount;

    this.repository.setStudentPoints(student.id, newTotal, newAvailable);
    this.repository.insertRecord(student.id, recordType, amount, description);

    return { total_points: newTotal, available_points: newAvailable };
  }

  private ensureTeacherCanManageClass(req: ServiceRequest, classIdInput: unknown): number {
    const classId = Number(classIdInput);
    if (!Number.isFinite(classId)) {
      throw new ApiError(400, 'Invalid class');
    }

    const actor = requestActor(req);
    if (actor.role === 'admin' || actor.role === 'superadmin') return classId;

    if (actor.role !== 'teacher' || !actor.id) {
      throw new ApiError(403, '无权限管理该班级');
    }

    const ownedClass = this.repository.ownedClassByTeacher(classId, actor.id);
    if (!ownedClass) {
      throw new ApiError(403, '无权限管理该班级');
    }

    return classId;
  }

  private ensureTeacherCanManageStudent(req: ServiceRequest, studentId: number): void {
    const actor = requestActor(req);
    if (actor.role === 'admin' || actor.role === 'superadmin') return;

    if (actor.role !== 'teacher' || !actor.id) {
      throw new ApiError(403, '无权限修改该学生');
    }

    const relation = this.repository.studentRelationToTeacher(studentId, actor.id);
    if (!relation) {
      throw new ApiError(403, '无权限修改该学生');
    }
  }

  // -- actor scope ----------------------------------------------------------
  //
  // The plugin's routes used to hand their data to anyone, headers or not, and even a valid
  // teacher credential returned the whole school rather than the teacher's own classes. Every
  // route now resolves the caller from the kernel's verified request context and refuses an
  // anonymous one with 401 before answering anything, then narrows the answer to what the role
  // owns: a teacher owns classes, a student owns one row, a parent owns their linked children,
  // admin/superadmin own everything. The scope helpers below reuse the repository reads the
  // account-deletion scope already had (`ownedClassByTeacher`, `studentRelationToTeacher`,
  // `listStudentsByParent`, `listClassesForStudentUser`, `listClassesForParentUser`), so "may
  // this actor touch this class/student" is answered once instead of per endpoint.

  /** The caller, or 401 when the request carries no verified actor. */
  private requireActor(req: ServiceRequest): RequestActor {
    const actor = requestActor(req);
    if (!actor.role || actor.id === null) {
      throw new ApiError(401, '未登录或登录已过期');
    }
    return actor;
  }

  /** The roles that may reach every class and student: the admin console. */
  private isStaffAdmin(actor: RequestActor): boolean {
    return actor.role === 'admin' || actor.role === 'superadmin';
  }

  /** The student row the actor's login owns, or `null` for a non-student or unbound account. */
  private ownStudentRow(actor: RequestActor): StudentRow | null {
    if (actor.role !== 'student' || actor.id === null) return null;
    return this.repository.findStudentByUserId(actor.id) ?? null;
  }

  /** `classId` as a number, or `undefined` when the caller did not narrow by class. */
  private classFilterOf(classId: unknown): number | undefined {
    return classId === undefined || classId === null || classId === '' ? undefined : this.normalizeId(classId, 'class');
  }

  /**
   * The student ids a non-staff actor may read: their own row, or their linked children.
   *
   * Any other role has no student scope at all, which is a 403 rather than an empty list -
   * the caller is known, it simply has no claim.
   */
  private ownStudentIds(actor: RequestActor): number[] {
    if (actor.role === 'student' && actor.id !== null) {
      const student = this.repository.findStudentByUserId(actor.id);
      return student ? [student.id] : [];
    }

    if (actor.role === 'parent' && actor.id !== null) {
      return this.repository.listStudentsByParent(actor.id).map((student) => student.id);
    }

    throw new ApiError(403, '无权限查看学生');
  }

  /**
   * The student ids of the classes a teacher owns, optionally narrowed to one of them.
   *
   * A `classId` the teacher does not own is refused rather than silently answered with their
   * own classes, so a filter can never be mistaken for a successful scoped read.
   */
  private teacherStudentIds(actor: RequestActor, classFilter: number | undefined, message: string): number[] {
    const owned = actor.id === null ? [] : this.repository.listClassIdsByTeacher(actor.id);
    if (classFilter !== undefined && !owned.includes(classFilter)) {
      throw new ApiError(403, message);
    }

    const classIds = classFilter === undefined ? owned : [classFilter];
    return this.repository.listStudentAccountsByClassIds(classIds).map((student) => student.id);
  }

  /**
   * The class a create/import write lands in.
   *
   * Admin may name any class, or none (the legacy "first class" default). A teacher may only
   * name a class they own, and with no class named the answer is their own first class - never
   * the database's first class, which is how the legacy default handed a teacher a roster in
   * someone else's room.
   */
  private resolveWritableClassId(actor: RequestActor, classIdInput: unknown, message: string): number {
    if (classIdInput !== undefined && classIdInput !== null && classIdInput !== '') {
      const classId = this.normalizeId(classIdInput, 'class');
      this.ensureClassAccess(actor, classId, ['teacher'], message);
      return classId;
    }

    if (this.isStaffAdmin(actor)) return this.resolveDefaultClassId(undefined);

    const owned = actor.id === null ? [] : this.repository.listClassIdsByTeacher(actor.id);
    if (owned.length === 0) {
      throw new ApiError(403, message);
    }
    return owned[0];
  }

  /**
   * 403 unless `actor` may name this one student.
   *
   * `roles` is the set of caller kinds allowed to name a student directly - `teacher` (own
   * class), `student` (own row), `parent` (linked child); admin/superadmin always pass. The
   * claim is always resolved from the database, never from the request.
   */
  private ensureStudentAction(actor: RequestActor, studentId: number, roles: string[], message: string): void {
    if (this.isStaffAdmin(actor)) return;
    if (actor.id === null || !actor.role || !roles.includes(actor.role)) {
      throw new ApiError(403, message);
    }

    if (actor.role === 'teacher' && this.repository.studentRelationToTeacher(studentId, actor.id)) return;
    if (actor.role === 'student' && this.ownStudentRow(actor)?.id === studentId) return;
    if (
      actor.role === 'parent' &&
      this.repository.listStudentsByParent(actor.id).some((child) => child.id === studentId)
    ) {
      return;
    }

    throw new ApiError(403, message);
  }

  /**
   * 403 unless `actor` may read this class.
   *
   * Same shape as `ensureStudentAction`, for the class-scoped routes: `teacher` (owner),
   * `student` (their own class), `parent` (a class one of their children is in);
   * admin/superadmin always pass.
   */
  private ensureClassAccess(actor: RequestActor, classId: number, roles: string[], message: string): void {
    if (this.isStaffAdmin(actor)) return;
    if (actor.id === null || !actor.role || !roles.includes(actor.role)) {
      throw new ApiError(403, message);
    }

    if (actor.role === 'teacher' && this.repository.ownedClassByTeacher(classId, actor.id)) return;
    if (
      actor.role === 'student' &&
      this.repository.listClassesForStudentUser(actor.id).some((row) => row.id === classId)
    ) {
      return;
    }
    if (
      actor.role === 'parent' &&
      this.repository.listClassesForParentUser(actor.id).some((row) => row.id === classId)
    ) {
      return;
    }

    throw new ApiError(403, message);
  }

  /** 403 unless the actor's role is one of `roles` (admin/superadmin always pass). */
  private requireRole(actor: RequestActor, roles: string[], message: string): void {
    if (this.isStaffAdmin(actor)) return;
    if (!actor.role || !roles.includes(actor.role)) {
      throw new ApiError(403, message);
    }
  }

  /** 403 unless `actor` has a claim on this one student's row. */
  private assertCanReadStudent(actor: RequestActor, student: StudentDetailRow): void {
    this.ensureStudentAction(actor, student.id, ['teacher', 'student', 'parent'], '无权限查看该学生');
  }

  // -- students ------------------------------------------------------------

  listStudents(req: ServiceRequest, classIdInput?: unknown): Array<Record<string, unknown>> {
    const actor = this.requireActor(req);

    if (this.isStaffAdmin(actor)) {
      const classFilter = this.classFilterOf(classIdInput);
      // `0` is not a class id, and `listStudentDetails` reads a falsy filter as "no filter" -
      // so the narrowing to a class that cannot exist is answered here, as the legacy query did.
      const students = classFilter === 0 ? [] : this.repository.listStudentDetails(classFilter);
      return students.map((student) => this.decryptStudent(student));
    }

    if (actor.role === 'teacher' && actor.id !== null) {
      const classFilter = this.classFilterOf(classIdInput);
      const ids = this.teacherStudentIds(actor, classFilter, '无权限查看该班级');
      return this.repository.listStudentDetailsByIds(ids).map((student) => this.decryptStudent(student));
    }

    // A student sees their own row and a parent their linked children. A `classId` filter
    // cannot widen either scope, so it is ignored rather than refused.
    return this.repository
      .listStudentDetailsByIds(this.ownStudentIds(actor))
      .map((student) => this.decryptStudent(student));
  }

  getStudent(req: ServiceRequest, id: string) {
    const actor = this.requireActor(req);
    const student = this.repository.getStudentDetail(id) as StudentDetailRow | undefined;
    if (!student) throw new ApiError(404, 'Student not found');
    this.assertCanReadStudent(actor, student);
    student.name = this.cipher.decrypt(student.name);
    return student;
  }

  checkin(req: ServiceRequest, input: Record<string, any>) {
    // Authorization first, like the legacy `requireActorRole`: an anonymous caller is refused
    // with 401 before any validation message can describe the payload.
    const actor = this.requireActor(req);

    const { studentId } = input ?? {};
    if (!studentId) throw new ApiError(400, 'Missing studentId');

    // A check-in is the student's own action: the actor must be that student's account.
    this.ensureStudentAction(actor, this.normalizeId(studentId, 'student'), ['student'], '无权限为该学生签到');

    const result = this.repository.tx(() => {
      const student = this.getStudentOrThrow(studentId);
      const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const datePart = (type: 'year' | 'month' | 'day') => dateParts.find((part) => part.type === type)?.value;
      const today = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
      if (student.last_checkin_date === today) {
        throw new ApiError(400, 'Already checked in today');
      }

      const amount = 1;
      const newTotal = (student.total_points ?? 0) + amount;
      const newAvailable = student.available_points ?? 0;

      this.repository.setStudentCheckin(student.id, today, newTotal, newAvailable);
      const recordId = this.repository.insertRecord(student.id, 'CHECKIN', amount, '每日签到：成长 +1，参与 +1');
      this.repository.insertPointEvent({ studentId: student.id, recordId, requestId: `checkin:${today}`, source: 'daily_checkin', category: 'participation', growth: 1, credits: 0, participation: 1, total: newTotal, available: newAvailable });

      try {
        this.repository.touchPetFedAt(student.id, 'datetime-now');
      } catch {
        // Same swallow as the legacy service: `pets` may not exist in an old database.
      }

      return { total_points: newTotal, available_points: newAvailable };
    });

    return { student: result, message: '签到成功，成长值 +1、参与 +1' };
  }

  gift(req: ServiceRequest, input: Record<string, any>) {
    const actor = this.requireActor(req);

    const { senderId, receiverId, points, message } = input ?? {};
    if (!senderId || !receiverId || !points || !message) {
      throw new ApiError(400, 'Missing required fields');
    }

    const amount = parseInt(points);
    if (isNaN(amount) || amount <= 0) throw new ApiError(400, 'Invalid points amount');

    // The sender is the actor, not a query parameter: a gift moves points out of one account,
    // and the legacy body let any caller name any sender.
    this.ensureStudentAction(actor, this.normalizeId(senderId, 'student'), ['student'], '无权限使用该学生账号赠送积分');

    this.repository.tx(() => {
      const sender = this.getStudentOrThrow(senderId);
      const receiver = this.getStudentOrThrow(receiverId);
      // Gifts stay inside the sender's class: naming a stranger's student id must not become a
      // way to read or move points across classes.
      if (receiver.class_id !== sender.class_id) {
        throw new ApiError(403, '无权限给该学生赠送积分');
      }
      if ((sender.available_points as number) < amount) throw new ApiError(400, 'Insufficient points');

      this.repository.subtractStudentAvailable(sender.id, amount);
      const sentRecord = this.repository.insertRecord(sender.id, 'DEDUCT_POINTS', -amount, '赠送积分给同学');
      this.repository.insertPointEvent({ studentId: sender.id, recordId: sentRecord, source: 'gift', category: 'balance', growth: 0, credits: -amount, total: sender.total_points ?? 0, available: (sender.available_points ?? 0) - amount });

      this.repository.addStudentAvailable(receiver.id, amount);
      const receivedRecord = this.repository.insertRecord(receiver.id, 'ADD_POINTS', amount, '收到同学赠送积分');
      this.repository.insertPointEvent({ studentId: receiver.id, recordId: receivedRecord, source: 'gift', category: 'balance', growth: 0, credits: amount, total: receiver.total_points ?? 0, available: (receiver.available_points ?? 0) + amount });

      const fullMessage = `[附赠 ${amount} 积分] ${message}`;
      // `type: 'PEER_REVIEW'` for a gift is a legacy quirk that the message list depends
      // on; it is preserved rather than "fixed".
      this.repository.insertGiftMessage(sender.class_id, sender.id, receiver.id, fullMessage);
    });

    return { message: 'Gift sent successfully' };
  }

  batchImport(req: ServiceRequest, input: Record<string, any>) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限导入学生');

    const { students, class_id } = input ?? {};
    if (!Array.isArray(students) || students.length === 0) {
      throw new ApiError(400, 'No students provided');
    }

    const targetClassId = this.resolveWritableClassId(actor, class_id, '无权限向该班级导入学生');

    const result = this.repository.tx(() => {
      let importedCount = 0;
      const createdStudents: CreatedStudent[] = [];
      for (const student of students) {
        const { username, name } = student;
        if (!username || !name) continue;
        createdStudents.push(
          this.createStudentAccount({ username, name, classId: targetClassId, allowUsernameSuffix: true }),
        );
        importedCount++;
      }
      return { importedCount, createdStudents };
    });

    return {
      message: `成功导入 ${result.importedCount} 个学生，初始密码已安全保存`,
      importedCount: result.importedCount,
      students: result.createdStudents,
    };
  }

  createStudent(req: ServiceRequest, input: Record<string, any>) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限创建学生');

    const { username, name, class_id } = input ?? {};
    if (
      !username ||
      typeof username !== 'string' ||
      username.trim() === '' ||
      !name ||
      typeof name !== 'string' ||
      name.trim() === ''
    ) {
      throw new ApiError(400, '请填写学生姓名和用户名');
    }

    const targetClassId = this.resolveWritableClassId(actor, class_id, '无权限向该班级添加学生');

    try {
      const student = this.repository.tx(() =>
        this.createStudentAccount({ username, name, classId: targetClassId }),
      );
      return { message: '学生创建成功，初始密码已安全保存', student };
    } catch (error: any) {
      if (String(error?.message ?? '').includes('UNIQUE constraint failed')) {
        throw new ApiError(409, '用户名已存在，请换一个用户名');
      }
      throw error;
    }
  }

  batchPoints(req: ServiceRequest, input: Record<string, any>) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限修改学生积分');

    const { studentIds, amount, reason } = input ?? {};
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new ApiError(400, 'No students selected');
    }
    if (!Number.isInteger(amount) || amount === 0 || amount < -5 || amount > 5) throw new ApiError(400, '每次评分须为 −5 至 +5 的非零整数');
    const requestId = input?.requestId;
    if (new Set(studentIds.map(String)).size !== studentIds.length) throw new ApiError(400, '学生列表中有重复项');

    // Every id in the batch has to be in a class the teacher owns; one foreign id refuses the
    // whole batch rather than silently scoring the subset that happens to be theirs.
    for (const studentId of studentIds) {
      this.ensureStudentAction(actor, this.normalizeId(studentId, 'student'), ['teacher'], '无权限修改该学生的积分');
    }

    const results = this.repository.tx(() => studentIds.map((studentId) => this.scoreStudent(Number(studentId), amount, String(reason ?? ''), requestId)));
    return { message: 'Points updated successfully', results };
  }

  updateStudentClass(req: ServiceRequest, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const classId = Number(input?.class_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(classId)) {
      throw new ApiError(400, 'Invalid student or class');
    }

    this.ensureTeacherCanManageStudent(req, studentId);
    // The destination has to be the caller's own class too, or "move student" becomes a way to
    // push rows into another teacher's roster.
    this.ensureClassAccess(requestActor(req), classId, ['teacher'], '无权限管理该班级');
    const targetClass = this.repository.findClassRow(classId);
    if (!targetClass) throw new ApiError(404, 'Class not found');

    this.repository.moveStudentToClass(studentId, classId);
  }

  updateStudentGroup(req: ServiceRequest, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const groupId =
      input?.group_id === null || input?.group_id === undefined || input?.group_id === ''
        ? null
        : Number(input.group_id);

    if (!Number.isFinite(studentId)) throw new ApiError(400, 'Invalid student');
    this.ensureTeacherCanManageStudent(req, studentId);

    if (groupId !== null && !Number.isFinite(groupId)) throw new ApiError(400, 'Invalid group');
    if (groupId !== null) {
      const group = this.repository.groupBelongsToStudentClass(studentId, groupId);
      if (!group) throw new ApiError(400, '小组不属于该学生所在班级');
    }

    this.repository.setStudentGroup(studentId, groupId);
  }

  resetStudentPassword(req: ServiceRequest, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const password = typeof input?.password === 'string' && input.password.trim() ? input.password.trim() : '123456';
    if (!Number.isFinite(studentId)) throw new ApiError(400, 'Invalid student');

    this.ensureTeacherCanManageStudent(req, studentId);
    const student = this.repository.studentUserId(studentId);
    if (!student) throw new ApiError(404, 'Student not found');

    this.repository.updateUserPassword(student.user_id, hashPassword(password));
    return { message: '密码重置成功' };
  }

  batchEdit(req: ServiceRequest, input: Record<string, any>) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限修改学生');

    const { studentIds, action, value } = input ?? {};
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new ApiError(400, 'No students selected');
    }

    // `action: 'reset_password'` makes this the account-takeover route the migration matrix
    // calls out: it must be gated exactly like `PUT /api/students/:id/password`, whose
    // ownership check it used to bypass.
    for (const studentId of studentIds) {
      this.ensureStudentAction(actor, this.normalizeId(studentId, 'student'), ['teacher'], '无权限修改该学生');
    }

    this.repository.tx(() => {
      for (const studentId of studentIds) {
        const student = this.getStudentOrThrow(studentId);
        if (action === 'change_class') {
          // The target class has to be the teacher's too, or a batch edit becomes a way to move
          // students into another teacher's roster.
          const targetClassId = this.normalizeId(value, 'class');
          this.ensureClassAccess(actor, targetClassId, ['teacher'], '无权限把学生移到该班级');
          if (!this.repository.findClassRow(targetClassId)) throw new ApiError(404, '目标班级不存在');
          this.repository.setStudentClassId(student.id, targetClassId);
        } else if (action === 'change_group') {
          const groupId = value === 'ungrouped' || value === null || value === '' ? null : this.normalizeId(value, 'group');
          if (groupId !== null && !this.repository.groupBelongsToStudentClass(student.id, groupId)) throw new ApiError(400, '小组不属于该学生所在班级');
          this.repository.setStudentGroup(student.id, groupId);
        } else if (action === 'reset_password') {
          if (typeof value !== 'string' || value.length < 6) throw new ApiError(400, '新密码至少 6 位');
          this.repository.updateUserPassword(student.user_id, hashPassword(value));
        } else {
          throw new ApiError(400, 'Invalid batch action');
        }
      }
    });

    return { message: 'Students updated successfully' };
  }

  updateStudentPoints(req: ServiceRequest, idInput: string, input: Record<string, any>) {
    // A teacher scores a student of their own class; a parent rewards their own child
    // (`src/pages/Parent/Tasks.tsx` approves a family task by adding points). Nobody may score
    // an arbitrary student id.
    const actor = this.requireActor(req);
    this.ensureStudentAction(
      actor,
      this.normalizeId(idInput, 'student'),
      ['teacher', 'parent'],
      '无权限修改该学生的积分',
    );

    const { amount: rawAmount, reason } = input ?? {};
    if (actor.role === 'parent') {
      const match = /^family-task:(\d+)$/.exec(String(input?.requestId ?? ''));
      if (!match || !Number.isInteger(rawAmount) || rawAmount <= 0) throw new ApiError(403, '家长奖励须来自已完成的家庭任务');
      const task = this.repository.approvedFamilyTask(Number(match[1]));
      if (!task || task.student_id !== Number(idInput) || task.points !== rawAmount) throw new ApiError(403, '家庭任务奖励不匹配');
      return this.repository.tx(() => {
        const prior = this.repository.findPointEvent(task.student_id, input.requestId);
        if (prior) return { studentId: task.student_id, applied: Number(prior.credits_delta), bonus: 0, total_points: Number(prior.growth_balance), available_points: Number(prior.credits_balance), replayed: true };
        const student = this.getStudentOrThrow(task.student_id);
        const total = (student.total_points ?? 0) + rawAmount;
        const available = (student.available_points ?? 0) + rawAmount;
        this.repository.setStudentPoints(student.id, total, available);
        const recordId = this.repository.insertRecord(student.id, 'FAMILY_TASK_REWARD', rawAmount, `完成家庭约定: ${task.title}`);
        this.repository.insertPointEvent({ studentId: student.id, recordId, requestId: input.requestId, source: 'family_task', category: 'participation', growth: rawAmount, credits: rawAmount, participation: 1, requested: rawAmount, total, available });
        return { studentId: student.id, applied: rawAmount, bonus: 0, total_points: total, available_points: available, replayed: false };
      });
    }
    if (actor.role !== 'teacher' && !this.isStaffAdmin(actor)) throw new ApiError(403, '仅教师可进行课堂评分');
    return this.repository.tx(() => this.scoreStudent(Number(idInput), rawAmount, String(reason ?? ''), input?.requestId));
  }

  getRecords(req: ServiceRequest, query: Record<string, any>) {
    const actor = this.requireActor(req);
    const requested = query?.studentId;
    const requestedId =
      requested === undefined || requested === null || requested === ''
        ? undefined
        : this.normalizeId(requested, 'student');

    // The admin console keeps the legacy filter branches verbatim (student, teacher, or all);
    // every other role is narrowed to the students it may read, whatever the query asked for.
    const records = this.isStaffAdmin(actor)
      ? this.repository.listRecords(query ?? {})
      : this.scopedRecords(actor, requestedId);

    return records.map((record) => ({ ...record, student_name: this.cipher.decrypt(record.student_name as string) }));
  }

  /** The ledger rows a non-admin actor may read, narrowed to its student scope. */
  private scopedRecords(actor: RequestActor, requestedId?: number): LedgerRow[] {
    if (actor.role === 'teacher' && actor.id !== null) {
      if (requestedId === undefined) {
        // The legacy `teacherId` branch - the records of every student in the classes this
        // teacher owns - with the teacher taken from the actor instead of the query, so
        // `?teacherId=<someone else>` cannot widen the read.
        return this.repository.listRecords({ teacherId: actor.id });
      }
      if (!this.repository.studentRelationToTeacher(requestedId, actor.id)) {
        throw new ApiError(403, '无权限查看该学生的积分记录');
      }
      return this.repository.listRecords({ studentId: requestedId });
    }

    const ids = this.ownStudentIds(actor);
    if (requestedId === undefined) return this.repository.listRecordsForStudents(ids);
    if (!ids.includes(requestedId)) {
      throw new ApiError(403, '无权限查看该学生的积分记录');
    }
    return this.repository.listRecords({ studentId: requestedId });
  }

  updateBirthday(req: ServiceRequest, id: string, input: Record<string, any>) {
    const { birthday } = input ?? {};
    // Birthday is PII: only the teacher who owns the student's class (or the admin) may set it.
    const actor = this.requireActor(req);
    this.ensureStudentAction(actor, this.normalizeId(id, 'student'), ['teacher'], '无权限修改该学生的生日');

    this.getStudentOrThrow(id);
    this.repository.setStudentBirthday(id, birthday);
    return { message: 'Birthday updated successfully' };
  }

  getProgressStar(req: ServiceRequest, classIdInput?: unknown) {
    const actor = this.requireActor(req);

    if (this.isStaffAdmin(actor)) {
      const classFilter = this.classFilterOf(classIdInput);
      const students = classFilter === 0 ? [] : this.repository.listProgressStar(classFilter);
      return students.map((student) => this.decryptStudent(student));
    }

    const classFilter = this.classFilterOf(classIdInput);
    const ids =
      actor.role === 'teacher'
        ? this.teacherStudentIds(actor, classFilter, '无权限查看该班级')
        : // A student sees their own row, a parent their children; a `classId` filter cannot
          // widen either scope, so it is ignored rather than refused.
          this.ownStudentIds(actor);

    return this.repository.listProgressStarForStudents(ids).map((student) => this.decryptStudent(student));
  }

  getAchievements(req: ServiceRequest, id: string) {
    const actor = this.requireActor(req);
    this.ensureStudentAction(
      actor,
      this.normalizeId(id, 'student'),
      ['teacher', 'student', 'parent'],
      '无权限查看该学生的成就',
    );

    const student = this.getStudentOrThrow(id);
    this.features.assertClassFeatureEnabled(student.class_id, 'enable_achievements');

    const existingAchievements = this.repository.listAchievementNames(id);
    const earnedSet = new Set(existingAchievements.map((achievement) => achievement.achievement_name));
    const newAchievements: string[] = [];

    const award = (name: string, description: string) => {
      if (!earnedSet.has(name)) {
        this.repository.insertAchievement(id, name, description);
        earnedSet.add(name);
        newAchievements.push(name);
      }
    };

    if (!earnedSet.has('初出茅庐')) {
      const pet = this.repository.petLevel(id);
      if (pet && pet.level >= 2) award('初出茅庐', '宠物达到2级及以上');
    }

    if (!earnedSet.has('自律骑士')) {
      const tasks = this.repository.familyTaskCount(id);
      if (tasks && tasks.count >= 7) award('自律骑士', '完成7个家庭任务');
    }

    if (!earnedSet.has('非酋附体')) {
      const draws = this.repository.listLuckyDraws(id);

      let streak = 0;
      for (const draw of draws) {
        if (draw.is_win === 0) {
          streak++;
          if (streak >= 5) {
            award('非酋附体', '连续5次抽奖未中奖');
            break;
          }
        } else {
          streak = 0;
        }
      }
    }

    return { achievements: Array.from(earnedSet), newAchievements };
  }

  getPendingPeerReviews(req: ServiceRequest, id: string) {
    // The pending list is the reviewer's own queue of classmates, and it names them.
    const actor = this.requireActor(req);
    this.ensureStudentAction(actor, this.normalizeId(id, 'student'), ['student'], '无权限查看该学生的待评列表');

    const student = this.getStudentOrThrow(id);
    this.features.assertStudentFeatureEnabled(Number(id), 'enable_peer_review');

    const peers = student.group_id
      ? this.repository.listGroupPeers(student.group_id, id)
      : this.repository.listClassPeers(student.class_id, id, 10);

    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const reviewedIds = new Set(
      this.repository.listReviewedIds(id, thisWeekStart.toISOString()).map((review) => review.reviewee_id),
    );

    return peers
      .filter((peer) => !reviewedIds.has(peer.id))
      .map((peer) => ({ id: peer.id, name: this.cipher.decrypt(peer.name) }));
  }

  createPeerReview(req: ServiceRequest, id: string, input: Record<string, any>) {
    // The reviewer is the actor: the route used to let any caller submit a review - and the
    // two-sided point rewards - in any student's name.
    const actor = this.requireActor(req);
    this.ensureStudentAction(actor, this.normalizeId(id, 'student'), ['student'], '无权限提交该学生的互评');

    const { reviewee_id, score, comment, is_anonymous } = input ?? {};
    if (!reviewee_id || typeof score !== 'number' || score < 1 || score > 5) {
      throw new ApiError(400, 'Invalid review data');
    }

    this.features.assertStudentFeatureEnabled(Number(id), 'enable_peer_review');

    const reviewerReward = 10;
    const revieweeReward = score * 2;

    this.repository.tx(() => {
      this.repository.insertPeerReview(id, reviewee_id, score, comment || '');
      this.repository.addStudentPointsPair(id as never, reviewerReward);
      const reviewer = this.repository.findStudentRow(Number(id));
      const reviewerRecord = this.repository.insertRecord(id, 'ADD_POINTS', reviewerReward, '完成本周同伴互评奖励');
      this.repository.insertPointEvent({ studentId: Number(id), recordId: reviewerRecord, source: 'peer_review', category: 'collaboration', growth: reviewerReward, credits: reviewerReward, total: reviewer?.total_points ?? 0, available: reviewer?.available_points ?? 0 });

      this.repository.addStudentPointsPair(reviewee_id, revieweeReward);
      const reviewee = this.repository.findStudentRow(Number(reviewee_id));
      const revieweeRecord = this.repository.insertRecord(reviewee_id, 'ADD_POINTS', revieweeReward, `收到同伴互评奖励 (${score}星)`);
      this.repository.insertPointEvent({ studentId: Number(reviewee_id), recordId: revieweeRecord, source: 'peer_review', category: 'collaboration', growth: revieweeReward, credits: revieweeReward, total: reviewee?.total_points ?? 0, available: reviewee?.available_points ?? 0 });

      const reviewerName = this.repository.studentName(id);
      const senderName = is_anonymous ? '一位匿名的魔法师' : this.cipher.decrypt(reviewerName?.name as string);
      const messageContent = `你收到了一份同伴评价！\n评分：${'⭐'.repeat(score)}\n评语：${comment || '无'}`;
      this.repository.insertPeerReviewMessage(reviewee_id, senderName, messageContent, is_anonymous);
    });

    return { message: '互评提交成功，已发放积分奖励！' };
  }

  private decryptStudent<T extends { name: string }>(student: T): T {
    return { ...student, name: this.cipher.decrypt(student.name) };
  }

  // -- classes -------------------------------------------------------------

  listClasses(req: ServiceRequest, teacherId?: unknown): ClassRow[] {
    const actor = requestActor(req);

    if (actor.role === 'teacher' && actor.id) {
      return this.repository.listClassesByTeacher(actor.id);
    }

    if (actor.role === 'student' && actor.id) {
      return this.repository.listClassesForStudentUser(actor.id);
    }

    if (actor.role === 'parent' && actor.id) {
      return this.repository.listClassesForParentUser(actor.id);
    }

    if (actor.role === 'admin' || actor.role === 'superadmin') {
      return teacherId ? this.repository.listClassesByTeacher(teacherId) : this.repository.listAllClasses();
    }

    throw new ApiError(403, '无权限查看班级');
  }

  getInvite(code: string, role?: unknown) {
    const cls = this.repository.classByInviteCode(code);
    if (!cls) throw new ApiError(404, '无效的邀请码');

    const students = this.repository.listClassStudentNames(cls.id, role !== 'parent');

    return {
      class: cls,
      students: students.map((student) => ({ ...student, name: this.cipher.decrypt(student.name) })),
    };
  }

  createClass(req: ServiceRequest, input: Record<string, any>) {
    const { name, teacher_id } = input ?? {};
    if (!name) throw new ApiError(400, 'Class name is required');

    const actor = requestActor(req);
    let teacherId = actor.role === 'teacher' && actor.id ? actor.id : teacher_id;
    if (actor.role !== 'teacher' && actor.role !== 'admin' && actor.role !== 'superadmin') {
      throw new ApiError(403, '无权限创建班级');
    }
    if (!teacherId) {
      const teacher = this.repository.findTeacherId(false);
      if (!teacher) throw new ApiError(400, 'Teacher not found');
      teacherId = teacher.id;
    }

    const inviteCode = generateInviteCode();
    const id = this.repository.insertClass(name, teacherId, inviteCode);
    return { id, name, teacher_id: teacherId, invite_code: inviteCode };
  }

  getClass(req: ServiceRequest, id: string) {
    // The row carries `invite_code`, which is itself a join credential: it must not answer an
    // anonymous caller, and a caller from another class has no business reading it either.
    const actor = this.requireActor(req);
    this.ensureClassAccess(actor, this.normalizeId(id, 'class'), ['teacher', 'student', 'parent'], '无权限查看该班级');

    const cls = this.repository.findClassRow(id);
    if (!cls) throw new ApiError(404, 'Class not found');
    return cls;
  }

  getClassFeatures(req: ServiceRequest, id: string) {
    // Feature flags gate the caller's own pages, so the caller's own class is the read scope.
    const actor = this.requireActor(req);
    this.ensureClassAccess(
      actor,
      this.normalizeId(id, 'class'),
      ['teacher', 'student', 'parent'],
      '无权限查看该班级',
    );

    const cls = this.repository.findClassRow(id);
    if (!cls) throw new ApiError(404, 'Class not found');
    return {
      classId: Number(id),
      // Resolved through the capability layer: assignments first, legacy columns as the
      // fallback - the same path every feature assertion uses.
      features: this.features.getClassFeaturesByClassId(Number(id)),
      pet_selection_mode: cls.pet_selection_mode ?? 'random',
    };
  }

  getIncentivePolicy(req: ServiceRequest, id: string) {
    const actor = this.requireActor(req);
    const classId = this.normalizeId(id, 'class');
    this.ensureClassAccess(actor, classId, ['teacher', 'student', 'parent'], '无权限查看该班级');
    if (!this.repository.findClassRow(classId)) throw new ApiError(404, '班级不存在');
    const policy = this.repository.incentivePolicy(classId);
    return { classId, schoolStage: policy.school_stage, parentBonusPercent: policy.parent_bonus_percent, teamRankingsVisible: !!policy.team_rankings_visible };
  }

  updateIncentivePolicy(req: ServiceRequest, id: string, input: Record<string, any>) {
    const actor = this.requireActor(req);
    const classId = this.normalizeId(id, 'class');
    this.ensureClassAccess(actor, classId, ['teacher'], '无权限修改该班级');
    if (!this.repository.findClassRow(classId)) throw new ApiError(404, '班级不存在');
    const current = this.repository.incentivePolicy(classId);
    const stage = input?.schoolStage ?? current.school_stage;
    const bonus = input?.parentBonusPercent ?? current.parent_bonus_percent;
    const rankings = input?.teamRankingsVisible ?? !!current.team_rankings_visible;
    if (!['general', 'primary', 'middle', 'high'].includes(stage)) throw new ApiError(400, '无效学段');
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > 20 || bonus % 5 !== 0) throw new ApiError(400, '家长加成须为 0% 至 20%，每次递增 5%');
    if (typeof rankings !== 'boolean') throw new ApiError(400, '团队榜可见性须为布尔值');
    this.repository.setIncentivePolicy(classId, stage, bonus, rankings);
    return this.getIncentivePolicy(req, id);
  }

  getStudentSummary(req: ServiceRequest, id: string) {
    const actor = this.requireActor(req);
    const studentId = this.normalizeId(id, 'student');
    this.ensureStudentAction(actor, studentId, ['teacher', 'student', 'parent'], '无权限查看该学生');
    const student = this.getStudentOrThrow(studentId);
    const rows = this.repository.pointSummary(studentId);
    const byCategory = Object.fromEntries(rows.map((row) => [row.category, row]));
    const policy = this.repository.incentivePolicy(student.class_id);
    return {
      studentId,
      growth: student.total_points ?? 0,
      collaboration: byCategory.collaboration?.score ?? 0,
      competition: byCategory.competition?.score ?? 0,
      participation: byCategory.participation?.participation ?? 0,
      availableCredits: student.available_points ?? 0,
      level: (student.total_points ?? 0) >= 500 ? '远航' : (student.total_points ?? 0) >= 300 ? '领航' : (student.total_points ?? 0) >= 150 ? '探索' : (student.total_points ?? 0) >= 50 ? '启程' : '萌芽',
      schoolStage: policy.school_stage,
      parentBonusPercent: policy.parent_bonus_percent,
      parentBlessingActive: this.repository.hasParentActivityShanghaiToday(studentId),
    };
  }

  getWeeklyTeamScores(req: ServiceRequest, id: string, category: string) {
    const actor = this.requireActor(req);
    const classId = this.normalizeId(id, 'class');
    this.ensureClassAccess(actor, classId, ['teacher', 'student', 'parent'], '无权限查看该班级');
    if (category !== 'collaboration' && category !== 'competition') throw new ApiError(400, '无效榜单类型');
    if (!this.repository.incentivePolicy(classId).team_rankings_visible && actor.role !== 'teacher' && !this.isStaffAdmin(actor)) throw new ApiError(403, '该班级未公开团队榜');
    return this.repository.weeklyTeamScores(classId, category);
  }

  getBigscreen(req: ServiceRequest, id: string) {
    // The big screen names students, praises and ledger rows: teacher-of-the-class or admin.
    const actor = this.requireActor(req);
    this.ensureClassAccess(actor, this.normalizeId(id, 'class'), ['teacher'], '无权限查看该班级大屏');

    const cls = this.repository.classBasic(id);
    if (!cls) throw new ApiError(404, '班级未找到');

    const topStudentsRaw = this.repository.listTopStudents(id);
    const latestPraisesRaw = this.repository.listPraisesForClass(id);
    const latestRecordsRaw = this.repository.listClassRecordsForBigscreen(id);
    const activeBoss = this.repository.activeWorldBoss();

    return {
      class: cls,
      topStudents: topStudentsRaw.map((student) => this.decryptStudent(student as { name: string })),
      latestPraises: latestPraisesRaw.map((praise) => ({
        ...praise,
        student_name: this.cipher.decrypt(praise.student_name as string),
      })),
      latestRecords: latestRecordsRaw.map((record) => ({
        ...record,
        student_name: this.cipher.decrypt(record.student_name as string),
      })),
      activeBoss: activeBoss ?? undefined,
    };
  }

  getGuildRanking(req: ServiceRequest, id: string) {
    // The student guild page reads its own class's ranking; the teacher reads the class it owns.
    const actor = this.requireActor(req);
    this.ensureClassAccess(
      actor,
      this.normalizeId(id, 'class'),
      ['teacher', 'student'],
      '无权限查看该班级公会榜',
    );

    const cls = this.repository.classGuildFlag(id);
    if (!cls) throw new ApiError(404, '班级未找到');
    if (!cls.enable_guild_pk) return { rankings: [], isEnabled: false };

    const rankings = this.repository.guildRanking(id);
    return { rankings, isEnabled: true };
  }

  updateClassSettings(req: ServiceRequest, id: string, input: Record<string, any>) {
    // One handler serves four paths (`settings` and `features` on both bases): whoever may flip
    // a class's feature flags decides which other domains are reachable for that class, so it
    // is the owning teacher (or the admin) only.
    const actor = this.requireActor(req);
    this.ensureClassAccess(actor, this.normalizeId(id, 'class'), ['teacher'], '无权限修改该班级设置');

    const cls = this.repository.findClassRow(id);
    if (!cls) throw new ApiError(404, 'Class not found');

    // Feature flags go through the capability layer (assignment + legacy column);
    // everything else stays a direct update.
    const featureUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(input ?? {})) {
      if (key.startsWith('enable_')) featureUpdates[key] = input[key];
    }

    const hasPetSelectionMode = input?.pet_selection_mode !== undefined;
    if (Object.keys(featureUpdates).length === 0 && !hasPetSelectionMode) {
      throw new ApiError(400, 'No settings provided');
    }

    if (hasPetSelectionMode) {
      this.repository.updateClassPetSelectionMode(id, input.pet_selection_mode);
    }

    const features =
      Object.keys(featureUpdates).length > 0
        ? this.features.setClassFeatures(Number(id), featureUpdates)
        : this.features.getClassFeaturesByClassId(Number(id));

    const updated = this.repository.classPetSelectionMode(id);
    return {
      message: 'Settings updated successfully',
      features,
      pet_selection_mode: updated?.pet_selection_mode ?? 'random',
    };
  }

  // -- groups --------------------------------------------------------------

  listGroups(req: ServiceRequest, classId?: unknown) {
    if (!classId) throw new ApiError(400, 'classId is required');
    const allowedClassId = this.ensureTeacherCanManageClass(req, classId);
    return this.repository.listGroups(allowedClassId);
  }

  createGroup(req: ServiceRequest, input: Record<string, any>) {
    const { name, class_id } = input ?? {};
    if (!name || !class_id) throw new ApiError(400, 'Name and class_id are required');
    const allowedClassId = this.ensureTeacherCanManageClass(req, class_id);
    const id = this.repository.insertGroup(name, allowedClassId);
    return this.repository.findGroup(id);
  }

  assignStudent(req: ServiceRequest, input: Record<string, any>) {
    const { studentId, groupId } = input ?? {};
    if (!studentId) throw new ApiError(400, 'studentId is required');
    this.ensureTeacherCanManageStudent(req, Number(studentId));
    if (groupId) {
      const group = this.repository.groupBelongsToStudentClass(studentId, groupId);
      if (!group) throw new ApiError(400, '小组不属于该学生所在班级');
    }
    this.repository.setStudentGroup(Number(studentId), groupId || null);
    return { message: 'Student assigned to group successfully' };
  }

  // -- presets -------------------------------------------------------------

  listPresets(req: ServiceRequest, teacherId?: unknown) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限查看积分预设');

    // A teacher's presets are their own; only the admin console may name another teacher.
    if (this.isStaffAdmin(actor)) return this.repository.listPresets(teacherId);
    return this.repository.listPresets(actor.id);
  }

  createPreset(req: ServiceRequest, input: Record<string, any>) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限创建积分预设');

    const { label, amount, teacher_id } = input ?? {};
    if (!label || amount === undefined) throw new ApiError(400, 'Label and amount are required');

    // The owner is the actor, never the body: the legacy default attached an anonymous preset
    // to the first teacher in the database.
    let teacherId = actor.role === 'teacher' ? actor.id : teacher_id;
    if (!teacherId) {
      const teacher = this.repository.findTeacherId(true);
      teacherId = teacher ? teacher.id : 1;
    }

    const id = this.repository.insertPreset(label, amount, teacherId);
    return this.repository.findPreset(id);
  }

  deletePreset(req: ServiceRequest, id: string) {
    const actor = this.requireActor(req);
    this.requireRole(actor, ['teacher'], '无权限删除积分预设');

    const preset = this.repository.findPreset(id);
    if (!preset) throw new ApiError(404, 'Preset not found');
    if (!this.isStaffAdmin(actor) && preset.teacher_id !== actor.id) {
      throw new ApiError(403, '无权限删除该积分预设');
    }

    this.repository.deletePreset(id);
    return { message: 'Preset deleted successfully' };
  }

  // -- attendance ----------------------------------------------------------

  listAttendance(req: ServiceRequest, queryInput: Record<string, any>) {
    const actor = this.requireActor(req);
    const query = queryInput ?? {};

    if (this.isStaffAdmin(actor)) return this.repository.listAttendance(query);

    // Attendance is student PII. The scope comes from the actor, and the query can only narrow
    // it: a teacher reads the students of the classes they own, a student their own rows and a
    // parent their children's, whatever `class_id` / `student_id` the request carries. A
    // `class_id` the teacher does not own is refused rather than answered with an empty list,
    // because a filter must never read as a successful scoped read.
    if (actor.role === 'teacher') {
      const classFilter = this.classFilterOf(query.class_id);
      const allowed = this.teacherStudentIds(actor, classFilter, '无权限查看该班级考勤');
      return this.repository
        .listAttendance({ date: query.date, student_id: query.student_id })
        .filter((row) => allowed.includes(Number(row.student_id)));
    }

    if (actor.role === 'student' || actor.role === 'parent') {
      const allowed = this.ownStudentIds(actor);
      return this.repository
        .listAttendance({ date: query.date, student_id: query.student_id })
        .filter((row) => allowed.includes(Number(row.student_id)));
    }

    throw new ApiError(403, '无权限查看考勤');
  }

  saveAttendance(req: ServiceRequest, input: Record<string, any>) {
    const { class_id, records } = input ?? {};

    const actor = this.requireActor(req);
    this.ensureClassAccess(actor, this.normalizeId(class_id, 'class'), ['teacher'], '无权限修改该班级考勤');

    // No argument to `tx`: the closure captures `records`, and passing `undefined` through
    // the transaction wrapper would change which error "records is not iterable" surfaces.
    this.repository.tx(() => {
      for (const rec of records) {
        this.repository.deleteAttendance(class_id, rec.student_id, rec.date);
        this.repository.insertAttendance(class_id, rec.student_id, rec.date, rec.status, rec.remark || null);
      }
    });
  }

  // -- leaves --------------------------------------------------------------

  listLeaves(req: ServiceRequest, queryInput: Record<string, any>) {
    const actor = this.requireActor(req);
    const query = queryInput ?? {};

    if (this.isStaffAdmin(actor)) return this.repository.listLeaves(query);

    // A leave reason is PII: the actor's scope decides which rows exist for it, the query only
    // filters within that scope.
    if (actor.role === 'teacher') {
      const allowed = this.teacherStudentIds(actor, undefined, '无权限查看请假');
      return this.repository
        .listLeaves({ status: query.status, student_id: query.student_id })
        .filter((row) => allowed.includes(Number(row.student_id)));
    }

    if (actor.role === 'student' || actor.role === 'parent') {
      const allowed = this.ownStudentIds(actor);
      return this.repository
        .listLeaves({ status: query.status, student_id: query.student_id })
        .filter((row) => allowed.includes(Number(row.student_id)));
    }

    throw new ApiError(403, '无权限查看请假');
  }

  createLeave(req: ServiceRequest, input: Record<string, any>) {
    const { student_id, start_date, end_date, reason } = input ?? {};

    // A parent files leave for their own child; the submitting parent is the actor, so the
    // legacy body's `parent_id` cannot name someone else.
    const actor = this.requireActor(req);
    this.requireRole(actor, ['parent'], '无权限提交请假');
    this.ensureStudentAction(actor, this.normalizeId(student_id, 'student'), ['parent'], '无权限为该学生提交请假');

    return this.repository.insertLeave(student_id, actor.role === 'parent' ? actor.id : input?.parent_id, start_date, end_date, reason);
  }

  updateLeave(req: ServiceRequest, id: string, input: Record<string, any>) {
    const { status, review_comment } = input ?? {};

    // Approving a leave is the class teacher's decision; the reviewer recorded is the actor.
    const actor = this.requireActor(req);
    const leave = this.repository.findLeave(id);
    if (!leave) throw new ApiError(404, 'Leave request not found');
    const student = this.repository.findStudentRow(leave.student_id);
    if (!student) throw new ApiError(404, 'Student not found');
    this.ensureStudentAction(actor, student.id, ['teacher'], '无权限审批该请假');

    this.repository.updateLeave(id, status, actor.role === 'teacher' ? actor.id : input?.reviewer_id, review_comment || null);
  }
}
