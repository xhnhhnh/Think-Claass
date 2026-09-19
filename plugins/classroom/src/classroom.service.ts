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
 * The error contract is the kernel `ApiError` (status + message). The controllers translate
 * nothing; the kernel's global filter renders `{success:false, message}` on the wire, which
 * is what the legacy `HttpException` produced.
 */

import { ApiError, hashPassword } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { ClassFeatureResolver } from './classroom.features.js';
import type { ClassroomRepository } from './classroom.repository.js';
import { requestActor, type NameCipher } from './classroom.support.js';
import type {
  ClassRow,
  CreatedStudent,
  CreateStudentAccountInput,
  StudentDetailRow,
  StudentRow,
} from './classroom.types.js';

/** Type of the `request` a controller hands over; only `header()` is used. */
type ServiceRequest = Parameters<typeof requestActor>[0];

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
    const newAvailable = Math.max(0, (student.available_points as number) + amount);

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

  // -- students ------------------------------------------------------------

  listStudents(classId?: unknown): Array<Record<string, unknown>> {
    return this.repository.listStudentDetails(classId).map((student) => this.decryptStudent(student));
  }

  getStudent(id: string) {
    const student = this.repository.getStudentDetail(id) as StudentDetailRow | undefined;
    if (!student) throw new ApiError(404, 'Student not found');
    student.name = this.cipher.decrypt(student.name);
    return student;
  }

  checkin(input: Record<string, any>) {
    const { studentId } = input ?? {};
    if (!studentId) throw new ApiError(400, 'Missing studentId');

    const result = this.repository.tx(() => {
      const student = this.getStudentOrThrow(studentId);
      const today = new Date().toISOString().split('T')[0];
      if (student.last_checkin_date === today) {
        throw new ApiError(400, 'Already checked in today');
      }

      const amount = 5;
      const newTotal = (student.total_points as number) + amount;
      const newAvailable = (student.available_points as number) + amount;

      this.repository.setStudentCheckin(student.id, today, newTotal, newAvailable);
      this.repository.insertRecord(student.id, 'ADD_POINTS', amount, '每日签到奖励');

      try {
        this.repository.touchPetFedAt(student.id, 'datetime-now');
      } catch {
        // Same swallow as the legacy service: `pets` may not exist in an old database.
      }

      return { total_points: newTotal, available_points: newAvailable };
    });

    return { student: result, message: '签到成功，获得 5 积分' };
  }

  gift(input: Record<string, any>) {
    const { senderId, receiverId, points, message } = input ?? {};
    if (!senderId || !receiverId || !points || !message) {
      throw new ApiError(400, 'Missing required fields');
    }

    const amount = parseInt(points);
    if (isNaN(amount) || amount <= 0) throw new ApiError(400, 'Invalid points amount');

    this.repository.tx(() => {
      const sender = this.getStudentOrThrow(senderId);
      const receiver = this.getStudentOrThrow(receiverId);
      if ((sender.available_points as number) < amount) throw new ApiError(400, 'Insufficient points');

      this.repository.subtractStudentAvailable(sender.id, amount);
      this.repository.insertRecord(sender.id, 'DEDUCT_POINTS', amount, '赠送积分给同学');

      this.addStudentPoints(receiver.id, amount, 'ADD_POINTS', '收到同学赠送积分');

      const fullMessage = `[附赠 ${amount} 积分] ${message}`;
      // `type: 'PEER_REVIEW'` for a gift is a legacy quirk that the message list depends
      // on; it is preserved rather than "fixed".
      this.repository.insertGiftMessage(sender.class_id, sender.id, receiver.id, fullMessage);
    });

    return { message: 'Gift sent successfully' };
  }

  batchImport(input: Record<string, any>) {
    const { students, class_id } = input ?? {};
    if (!Array.isArray(students) || students.length === 0) {
      throw new ApiError(400, 'No students provided');
    }

    const result = this.repository.tx(() => {
      let importedCount = 0;
      const createdStudents: CreatedStudent[] = [];
      for (const student of students) {
        const { username, name } = student;
        if (!username || !name) continue;
        createdStudents.push(this.createStudentAccount({ username, name, classId: class_id, allowUsernameSuffix: true }));
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

  createStudent(input: Record<string, any>) {
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

    try {
      const student = this.repository.tx(() => this.createStudentAccount({ username, name, classId: class_id }));
      return { message: '学生创建成功，初始密码已安全保存', student };
    } catch (error: any) {
      if (String(error?.message ?? '').includes('UNIQUE constraint failed')) {
        throw new ApiError(409, '用户名已存在，请换一个用户名');
      }
      throw error;
    }
  }

  batchPoints(input: Record<string, any>) {
    const { studentIds, amount, reason } = input ?? {};
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new ApiError(400, 'No students selected');
    }
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new ApiError(400, 'Invalid amount');
    }

    this.repository.tx(() => {
      for (const studentId of studentIds) {
        this.adjustStudentPoints(studentId, amount, reason, { revivePetOnPositive: true });
      }
    });

    return { message: 'Points updated successfully' };
  }

  updateStudentClass(req: ServiceRequest, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const classId = Number(input?.class_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(classId)) {
      throw new ApiError(400, 'Invalid student or class');
    }

    this.ensureTeacherCanManageStudent(req, studentId);
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

  batchEdit(input: Record<string, any>) {
    const { studentIds, action, value } = input ?? {};
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new ApiError(400, 'No students selected');
    }

    this.repository.tx(() => {
      for (const studentId of studentIds) {
        const student = this.getStudentOrThrow(studentId);
        if (action === 'change_class') {
          this.repository.setStudentClassId(student.id, value);
        } else if (action === 'change_group') {
          this.repository.setStudentGroup(student.id, value || null);
        } else if (action === 'reset_password') {
          this.repository.updateUserPassword(student.user_id, hashPassword(value || '123456'));
        } else {
          throw new ApiError(400, 'Invalid batch action');
        }
      }
    });

    return { message: 'Students updated successfully' };
  }

  updateStudentPoints(idInput: string, input: Record<string, any>) {
    const { amount: rawAmount, reason } = input ?? {};
    if (typeof rawAmount !== 'number' || isNaN(rawAmount)) {
      throw new ApiError(400, 'Invalid amount');
    }

    const transaction = () =>
      this.repository.tx(() => {
        const student = this.getStudentOrThrow(idInput);
        let amount = rawAmount;
        let finalReason = reason;

        if (amount > 0) {
          const classFeatures = this.features.getClassFeaturesByClassId(student.class_id);
          if (classFeatures.enable_parent_buff) {
            const today = new Date().toISOString().split('T')[0];
            const hasBuff = this.repository.hasParentActivityToday(student.id, today);

            if (hasBuff) {
              amount = Math.ceil(amount * 1.2);
              finalReason = `${reason} (含20%家长增益)`;
            }
          }
        }

        return this.adjustStudentPoints(student.id, amount, finalReason, { revivePetOnPositive: true });
      });

    return transaction();
  }

  getRecords(query: Record<string, any>) {
    return this.repository
      .listRecords(query ?? {})
      .map((record) => ({ ...record, student_name: this.cipher.decrypt(record.student_name as string) }));
  }

  updateBirthday(id: string, input: Record<string, any>) {
    const { birthday } = input ?? {};
    this.getStudentOrThrow(id);
    this.repository.setStudentBirthday(id, birthday);
    return { message: 'Birthday updated successfully' };
  }

  getProgressStar(classId?: unknown) {
    return this.repository.listProgressStar(classId).map((student) => this.decryptStudent(student));
  }

  getAchievements(id: string) {
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

  getPendingPeerReviews(id: string) {
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

  createPeerReview(id: string, input: Record<string, any>) {
    const { reviewee_id, score, comment, is_anonymous } = input ?? {};
    if (!reviewee_id || typeof score !== 'number' || score < 1 || score > 5) {
      throw new ApiError(400, 'Invalid review data');
    }

    this.features.assertStudentFeatureEnabled(Number(id), 'enable_peer_review');

    this.repository.insertPeerReview(id, reviewee_id, score, comment || '');

    const reviewerReward = 10;
    const revieweeReward = score * 2;

    this.repository.tx(() => {
      this.repository.addStudentPointsPair(id as never, reviewerReward);
      this.repository.insertRecord(id, 'ADD_POINTS', reviewerReward, '完成本周同伴互评奖励');

      this.repository.addStudentPointsPair(reviewee_id, revieweeReward);
      this.repository.insertRecord(reviewee_id, 'ADD_POINTS', revieweeReward, `收到同伴互评奖励 (${score}星)`);

      const reviewer = this.repository.studentName(id);
      const senderName = is_anonymous ? '一位匿名的魔法师' : this.cipher.decrypt(reviewer?.name as string);
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

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = this.repository.insertClass(name, teacherId, inviteCode);
    return { id, name, teacher_id: teacherId, invite_code: inviteCode };
  }

  getClass(id: string) {
    const cls = this.repository.findClassRow(id);
    if (!cls) throw new ApiError(404, 'Class not found');
    return cls;
  }

  getClassFeatures(id: string) {
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

  getBigscreen(id: string) {
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

  getGuildRanking(id: string) {
    const cls = this.repository.classGuildFlag(id);
    if (!cls) throw new ApiError(404, '班级未找到');
    if (!cls.enable_guild_pk) return { rankings: [], isEnabled: false };

    const rankings = this.repository.guildRanking(id);
    return { rankings, isEnabled: true };
  }

  updateClassSettings(id: string, input: Record<string, any>) {
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

  listPresets(teacherId?: unknown) {
    return this.repository.listPresets(teacherId);
  }

  createPreset(input: Record<string, any>) {
    const { label, amount, teacher_id } = input ?? {};
    if (!label || amount === undefined) throw new ApiError(400, 'Label and amount are required');

    let teacherId = teacher_id;
    if (!teacherId) {
      const teacher = this.repository.findTeacherId(true);
      teacherId = teacher ? teacher.id : 1;
    }

    const id = this.repository.insertPreset(label, amount, teacherId);
    return this.repository.findPreset(id);
  }

  deletePreset(id: string) {
    this.repository.deletePreset(id);
    return { message: 'Preset deleted successfully' };
  }

  // -- attendance ----------------------------------------------------------

  listAttendance(queryInput: Record<string, any>) {
    return this.repository.listAttendance(queryInput ?? {});
  }

  saveAttendance(input: Record<string, any>) {
    const { class_id, records } = input ?? {};

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

  listLeaves(queryInput: Record<string, any>) {
    return this.repository.listLeaves(queryInput ?? {});
  }

  createLeave(input: Record<string, any>) {
    const { student_id, parent_id, start_date, end_date, reason } = input ?? {};
    return this.repository.insertLeave(student_id, parent_id, start_date, end_date, reason);
  }

  updateLeave(id: string, input: Record<string, any>) {
    const { status, reviewer_id, review_comment } = input ?? {};
    this.repository.updateLeave(id, status, reviewer_id, review_comment || null);
  }
}
