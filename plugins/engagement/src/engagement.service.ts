/**
 * Engagement service.
 *
 * Behaviour is relocated from `api/modules/engagement/engagement.service.ts` unchanged: the same
 * queries, the same guards, the same messages, the same status codes. Four things are *not*
 * translations, and each is a boundary decision:
 *
 *  1. **The class gates go through `classroom.public`.** The pre-migration helpers
 *     (`assertClassFeatureEnabled` / `assertStudentFeatureEnabled` / `assertActorFeatureEnabled`)
 *     read `classes.enable_*` through `api/db.ts` and threw `ApiError(404, '班级未找到')` for a
 *     missing class. The port reports refusal as data, so each call site maps refusal back to the
 *     status the legacy helper threw - `class-not-found` -> 404, `feature-disabled` -> 403. Getting
 *     this wrong would turn a 403 into a 404 and vice versa; `plugins/learning` and
 *     `plugins/economy` made the same mapping, and the tests here pin it.
 *  2. **The pet write is a port.** `createPraise` used to `UPDATE pets SET experience, level,
 *     attack_power, mood` directly - a cross-plugin write that `data.reads` could not describe.
 *  3. **The point movements are port calls.** The lucky draw debited `students.available_points` and
 *     appended to `records` in one transaction; `classroom.public.spendStudentCredits` is that pair
 *     as one operation, for the reason its contract gives.
 *  4. **Display names come from the port.** `praises`, `certificates` and `messages` used to JOIN
 *     `students` (and `users`) for a name to decrypt. Those joins are replaced by
 *     `listStudentNamesByIds`, so this repository names only tables it owns.
 *
 * `redemption_tickets` stays local. It is the one table two plugins write (marketplace issues
 * tickets for shop purchases, this domain issues them as lucky-draw prizes and verifies both), and
 * the guardrail records it as an explicit exception rather than pretending it has one owner.
 * Deciding otherwise means designing a marketplace port and migrating that domain too; the debt is
 * named in the manifest instead of being quietly resolved in this direction.
 */

import { ApiError } from '@thinkclass/kernel';
import type {
  ClassroomPort,
  ClassroomRefusal,
  StudentSnapshot,
} from '@thinkclass/contracts/domains/classroom';
import type { IdentityPort } from '@thinkclass/contracts/domains/identity';
import type { PetPort } from '@thinkclass/contracts/domains/pet';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { EngagementRepository } from './engagement.repository.js';

export const DEFAULT_LUCKY_DRAW_COST = 10;

/** Why a gate refused, as the legacy helpers' statuses. See the file header. */
function gateError(refusal: ClassroomRefusal): ApiError {
  return refusal.code === 'class-not-found'
    ? new ApiError(404, refusal.message)
    : new ApiError(403, refusal.message);
}

export interface EngagementServiceDeps {
  ctx: KernelContext;
  repository: EngagementRepository;
  classroom: ClassroomPort;
  /** Lazy: optional in practice (lucky-draw config falls back), resolved at call time. */
  identity: () => IdentityPort | null;
  /** Lazy for the same reason: a praise must be recorded even with the pet feature disabled. */
  pet: () => PetPort | null;
}

export class EngagementService {
  private readonly ctx: KernelContext;
  private readonly repository: EngagementRepository;
  private readonly classroom: ClassroomPort;
  private readonly identity: () => IdentityPort | null;
  private readonly pet: () => PetPort | null;

  constructor(deps: EngagementServiceDeps) {
    this.ctx = deps.ctx;
    this.repository = deps.repository;
    this.classroom = deps.classroom;
    this.identity = deps.identity;
    this.pet = deps.pet;
  }

  // -- class gates ----------------------------------------------------------

  /** `assertClassFeatureEnabled`: 404 for a missing class, 403 when the flag is off. */
  private async assertClassFeature(classId: number, feature: string): Promise<void> {
    const snapshot = await this.classroom.getClassFeatureSnapshot(classId);
    if (snapshot === null) throw new ApiError(404, '班级未找到');
    const result = await this.classroom.checkClassFeature(classId, feature);
    if (result.refusal) throw gateError(result.refusal);
  }

  /** `assertAnyClassFeatureEnabled`: the class passes when *any* of the flags is on. */
  private async assertAnyClassFeature(classId: number, features: string[]): Promise<void> {
    const snapshot = await this.classroom.getClassFeatureSnapshot(classId);
    if (snapshot === null) throw new ApiError(404, '班级未找到');
    const result = await this.classroom.checkAnyClassFeature(classId, features);
    if (result.refusal) throw gateError(result.refusal);
  }

  /** `assertStudentFeatureEnabled`: the student's own class, 404 when the student is gone. */
  private async assertStudentFeature(studentId: number, feature: string): Promise<void> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, '学生未找到');
    await this.assertClassFeature(student.classId, feature);
  }

  /** `assertActorFeatureEnabled(userId, 'parent', ...)`: the class of the parent's first child. */
  private async assertParentFeature(parentId: number, feature: string): Promise<void> {
    const students = await this.classroom.listStudentsByParent(parentId);
    const student = students[0];
    if (!student) throw new ApiError(404, '班级未找到');
    await this.assertClassFeature(student.classId, feature);
  }

  /** Display names for a page of rows, in one port call. */
  private async nameMap(studentIds: number[]): Promise<Record<number, string>> {
    const unique = [...new Set(studentIds.filter((id) => Number.isFinite(id)))];
    return unique.length === 0 ? {} : this.classroom.listStudentNamesByIds(unique);
  }

  // -- announcements --------------------------------------------------------

  getActiveAnnouncement() {
    return this.repository.activeAnnouncement() || null;
  }

  getClassAnnouncements(classId: unknown) {
    return this.repository.classAnnouncements(classId as never);
  }

  createClassAnnouncement(input: Record<string, any>) {
    const { class_id, teacher_id, title, content } = input;
    const id = this.repository.insertClassAnnouncement({
      classId: class_id,
      teacherId: teacher_id,
      title,
      content,
    });

    return { id, class_id, teacher_id, title, content, created_at: new Date().toISOString() };
  }

  deleteClassAnnouncement(id: string) {
    this.repository.deleteClassAnnouncement(id);
  }

  // -- praises --------------------------------------------------------------

  async getPraisesByClass(classId: unknown) {
    const students = await this.classroom.listClassStudents(Number(classId));
    const praises = this.repository.praisesByStudentIds(students.map((student) => student.id));
    const names = await this.nameMap(praises.map((praise) => Number(praise.student_id)));
    return praises.map((praise) => ({ ...praise, student_name: names[Number(praise.student_id)] ?? null }));
  }

  async getPraisesByStudent(studentId: string) {
    const praises = this.repository.praisesByStudent(studentId);
    const names = await this.nameMap([Number(studentId)]);
    return praises.map((praise) => ({ ...praise, student_name: names[Number(studentId)] ?? null }));
  }

  /**
   * Record a praise, then grow the student's pet by 20 experience.
   *
   * The pre-migration version did both inside one SQLite transaction on one connection. They cannot
   * share a transaction across a plugin boundary, so the praise is written first and the pet grows
   * second: a praise that is recorded always survives, and a crash between the two loses only the
   * experience - the same trade `plugins/payment` documents for its activation ordering. A student
   * with no pet simply skips the second step, exactly as the `if (pet)` guard did.
   */
  async createPraise(input: Record<string, any>) {
    const { teacher_id, student_id, content, color } = input;
    const id = this.repository.insertPraise({
      teacherId: teacher_id,
      studentId: student_id,
      content,
      color: color || 'bg-yellow-100',
    });
    const praise = this.repository.findPraise(id);

    const petPort = this.pet();
    if (petPort) {
      await petPort.grantPetExperience({ studentId: Number(student_id), expGain: 20, mood: 'excited' });
    } else {
      this.ctx.log.warn('praise recorded without pet growth: pet.public unavailable', {
        studentId: Number(student_id),
      });
    }

    return praise;
  }

  deletePraise(id: string) {
    this.repository.deletePraise(id);
  }

  // -- certificates ---------------------------------------------------------

  async getCertificates(studentId: unknown) {
    const rows = this.repository.certificates(studentId ? (studentId as never) : null);
    const names = await this.nameMap(rows.map((row) => Number(row.student_id)));
    return rows.map((row) => ({ ...row, student_name: names[Number(row.student_id)] ?? null }));
  }

  createCertificate(input: Record<string, any>) {
    const { student_id, title, description } = input;
    const id = this.repository.insertCertificate({
      studentId: student_id,
      title,
      description: description || '',
    });
    return { id, student_id, title, description };
  }

  // -- redemption -----------------------------------------------------------

  getRedemptionTickets(studentId: unknown) {
    return this.repository.redemptionTickets(studentId as never);
  }

  async verifyRedemption(code: unknown) {
    const ticket = this.repository.redemptionByCode(code as never);
    if (!ticket) {
      return { status: 404, body: { success: false, message: '无效的核销码' } };
    }
    if (ticket.status === 'used') {
      return { status: 400, body: { success: false, message: '该凭证已被核销' } };
    }

    const names = await this.nameMap([Number(ticket.student_id)]);
    const studentName = names[Number(ticket.student_id)] ?? null;
    this.repository.markRedeemed(ticket.id as never, new Date().toISOString());

    return {
      status: 200,
      body: {
        success: true,
        message: '核销成功',
        ticket: { ...ticket, student_name: studentName, status: 'used' },
      },
    };
  }

  // -- messages -------------------------------------------------------------

  /**
   * The message feed, with the three foreign joins resolved through ports.
   *
   * Response assembly keeps the pre-migration order of decisions: the `TREE_HOLE` gate first, then
   * names, then the anonymity override (which wins over a title), then the achievement title, then
   * the removal of the helper columns. `enable_achievements === 1` is preserved as a strict
   * comparison: the column is an INTEGER that is `null` on older rows, and a truthiness check would
   * start granting titles on rows the old code left alone.
   */
  async getMessages(queryInput: Record<string, any>) {
    const { classId, type, receiverId, role, involvedId } = queryInput;

    if (classId && type === 'TREE_HOLE') {
      await this.assertAnyClassFeature(Number(classId), ['enable_tree_hole', 'enable_chat_bubble']);
    }

    const rows = this.repository.messages({
      classId: classId ? (classId as never) : null,
      type: type ? (type as never) : null,
      receiverId: receiverId ? (receiverId as never) : null,
      involvedId: involvedId ? (involvedId as never) : null,
    });

    const studentIds = [
      ...rows.filter((row) => row.sender_role === 'student').map((row) => Number(row.sender_id)),
      ...rows.map((row) => Number(row.receiver_id)).filter((id) => Number.isFinite(id)),
    ];
    const names = await this.nameMap(studentIds);

    // Non-student senders are `users` rows; the pre-migration query selected `u1.username` for
    // them. `getUserById` is the port for that, batched by the unique sender ids so a page of 50
    // messages does not become 50 calls.
    const userSenderIds = [
      ...new Set(
        rows
          .filter((row) => ['user', 'teacher', 'parent'].includes(String(row.sender_role)))
          .map((row) => Number(row.sender_id)),
      ),
    ];
    const usernames: Record<number, string> = {};
    const identity = this.identity();
    if (identity) {
      for (const id of userSenderIds) {
        const user = await identity.getUserById(id);
        if (user) usernames[id] = user.username;
      }
    }

    // The `enable_achievements` flag lives on `classes`; one snapshot read for the whole page.
    let achievementsEnabled = false;
    const classIds = [...new Set(rows.map((row) => Number(row.class_id)).filter((id) => Number.isFinite(id)))];
    for (const id of classIds) {
      const snapshot = await this.classroom.getClassFeatureSnapshot(id);
      if (snapshot?.enable_achievements) achievementsEnabled = true;
    }

    const topAchievements: Record<number, string> = achievementsEnabled
      ? Object.fromEntries(
          this.repository
            .achievementByStudentIds(
              rows.filter((row) => row.sender_role === 'student').map((row) => Number(row.sender_id)),
            )
            .map((row) => [row.student_id, row.achievement_name]),
        )
      : {};

    return rows.map((message) => {
      const m: Record<string, unknown> = { ...message };

      const isStudentSender = m.sender_role === 'student';
      m.sender_name = isStudentSender ? (names[Number(m.sender_id)] ?? null) : (usernames[Number(m.sender_id)] ?? null);
      if (m.receiver_id !== null && m.receiver_id !== undefined) {
        m.receiver_name = names[Number(m.receiver_id)] ?? null;
      }

      // Anonymity wins over the achievement title, and the title needs the class flag *and* a
      // stored achievement - the pre-migration `else if` chain, preserved in order.
      if (m.is_anonymous && role !== 'teacher') {
        m.sender_name = '匿名同学';
      } else if (achievementsEnabled && m.sender_role === 'student' && topAchievements[Number(m.sender_id)]) {
        m.sender_title = topAchievements[Number(m.sender_id)];
      }

      return m;
    });
  }

  async createMessage(input: Record<string, any>) {
    const {
      class_id,
      sender_id,
      receiver_id,
      content,
      is_anonymous,
      type,
      sender_role = 'student',
    } = input;

    if (type === 'TREE_HOLE') {
      await this.assertAnyClassFeature(Number(class_id), ['enable_tree_hole', 'enable_chat_bubble']);
    }

    return this.repository.insertMessage({
      classId: class_id,
      senderId: sender_id,
      receiverId: receiver_id || null,
      content,
      isAnonymous: is_anonymous ? 1 : 0,
      type,
      senderRole: sender_role,
    });
  }

  // -- family tasks ---------------------------------------------------------

  async getFamilyTasks(query: Record<string, any>) {
    const { studentId, parentId } = query;
    if (studentId) {
      await this.assertStudentFeature(Number(studentId), 'enable_family_tasks');
      return this.repository.familyTasksByStudent(studentId);
    }

    if (parentId) {
      await this.assertParentFeature(Number(parentId), 'enable_family_tasks');
      return this.repository.familyTasksByParent(parentId);
    }

    return undefined;
  }

  async createFamilyTask(input: Record<string, any>) {
    const { student_id, parent_id, title, points } = input;
    await this.assertStudentFeature(Number(student_id), 'enable_family_tasks');
    const id = this.repository.insertFamilyTask({
      studentId: student_id,
      parentId: parent_id,
      title,
      points,
    });

    return { id, student_id, parent_id, title, points, status: 'pending', created_at: new Date().toISOString() };
  }

  async updateFamilyTask(id: string, status: unknown) {
    const task = this.repository.familyTaskStudentId(id);
    if (!task) return false;

    await this.assertStudentFeature(task.student_id, 'enable_family_tasks');
    this.repository.setFamilyTaskStatus(id, status);
    return true;
  }

  async deleteFamilyTask(id: string) {
    const task = this.repository.familyTaskStudentId(id);
    if (!task) return false;

    await this.assertStudentFeature(task.student_id, 'enable_family_tasks');
    this.repository.deleteFamilyTask(id);
    return true;
  }

  // -- lucky draw -----------------------------------------------------------

  /** The teacher id the config belongs to: the given one, else the first teacher row. */
  private async resolveTeacherId(teacherId: unknown): Promise<unknown> {
    if (teacherId) return teacherId;
    const identity = this.identity();
    return (await identity?.getFirstUserIdByRole('teacher')) ?? 1;
  }

  async getLuckyDrawConfig(teacherId: unknown) {
    const tId = await this.resolveTeacherId(teacherId);
    const configs = this.repository.luckyDrawConfigs(tId as never);

    if (configs.length === 0) {
      return { configs: [], cost_points: DEFAULT_LUCKY_DRAW_COST };
    }

    return { configs, cost_points: configs[0].cost_points };
  }

  async updateLuckyDrawConfig(input: Record<string, any>) {
    const { teacher_id, cost_points, configs } = input;
    const tId = await this.resolveTeacherId(teacher_id);

    this.ctx.db.tx(() => {
      this.repository.deactivateLuckyDrawConfigs(tId as never);
      for (const conf of configs) {
        this.repository.insertLuckyDrawConfig({
          teacherId: tId as never,
          costPoints: cost_points || DEFAULT_LUCKY_DRAW_COST,
          prizeName: conf.prize_name,
          prizeType: conf.prize_type,
          prizeValue: conf.prize_value || null,
          probability: conf.probability || 0,
        });
      }
    });
  }

  /**
   * Draw a prize.
   *
   * The point debit + ledger pair is one port call (see `spendStudentCredits`); the win half is two
   * more port calls, because "add points" and "append a ledger row" are separately meaningful. The
   * pre-migration code had all four writes in one transaction; across a plugin boundary that is not
   * available, so the ordering is chosen so that a crash loses the *prize*, never the payment: debit
   * first, then grant.
   *
   * The student's class teacher id comes from `classroom.public.getStudentById` +
   * `getClassById` instead of the `JOIN classes` the old query used.
   */
  async drawLuckyPrize(studentId: unknown) {
    const student: StudentSnapshot | null = await this.classroom.getStudentById(Number(studentId));
    if (!student) {
      return { status: 404, body: { success: false, message: 'Student not found' } };
    }

    const cls = await this.classroom.getClassById(student.classId);
    if (!cls) {
      return { status: 404, body: { success: false, message: 'Student not found' } };
    }

    const configs = this.repository.luckyDrawConfigs(cls.teacherId as never);
    if (configs.length === 0) {
      return { status: 404, body: { success: false, message: 'No active lucky draw config' } };
    }

    const costPoints = Number(configs[0].cost_points) || DEFAULT_LUCKY_DRAW_COST;

    if (student.availablePoints < costPoints) {
      return { status: 409, body: { success: false, message: '积分不足' } };
    }

    const totalProb = configs.reduce((acc, curr) => acc + Number(curr.probability), 0);
    const rand = Math.floor(Math.random() * totalProb);
    let cumulative = 0;
    let wonConfig = configs[configs.length - 1];

    for (const conf of configs) {
      cumulative += Number(conf.probability);
      if (rand < cumulative) {
        wonConfig = conf;
        break;
      }
    }

    const payment = await this.classroom.spendStudentCredits({
      studentId: student.id,
      delta: -Number(costPoints),
      entry: {
        studentId: student.id,
        type: 'LUCKY_DRAW',
        amount: -Number(costPoints),
        description: '参与翻牌抽奖',
      },
    });
    if (payment.refusal) {
      // The pre-migration code had already checked the balance, so this only fires when a
      // concurrent draw spent the points first. Same 409 the stale read would have produced.
      return { status: 409, body: { success: false, message: '积分不足' } };
    }

    let prizeMessage = '';
    if (wonConfig.prize_type === 'POINTS') {
      const winAmount = Number(wonConfig.prize_value) || 0;
      if (winAmount > 0) {
        await this.classroom.adjustPoints({
          studentId: student.id,
          delta: winAmount,
          reason: `抽奖获得: ${wonConfig.prize_name}`,
          actorId: student.id,
        });
        await this.classroom.recordStudentLedgerEntry({
          studentId: student.id,
          type: 'LUCKY_DRAW_WIN',
          amount: winAmount,
          description: `抽奖获得: ${wonConfig.prize_name}`,
        });
        prizeMessage = `恭喜获得 ${winAmount} 积分！`;
      } else {
        prizeMessage = '很遗憾，本次未中奖。';
      }
    } else if (wonConfig.prize_type === 'ITEM') {
      const code = 'RED-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      this.repository.insertRedemptionTicket({
        studentId: student.id,
        itemId: wonConfig.prize_value as never,
        code,
        status: 'pending',
      });
      prizeMessage = `恭喜获得商品兑换券: ${wonConfig.prize_name}！请在“我的兑换”中查看。`;
    } else {
      prizeMessage = '很遗憾，本次未中奖。';
    }

    return { status: 200, body: { success: true, prize: wonConfig, message: prizeMessage } };
  }

  // -- danmaku --------------------------------------------------------------

  async getDanmakuMessages(classId: unknown, since: unknown) {
    await this.assertClassFeature(Number(classId), 'enable_danmaku');

    if (since) {
      return this.repository.danmakuSince(classId as never, since as never);
    }

    return this.repository.danmakuLatest(classId as never).reverse();
  }

  async createDanmakuMessage(input: Record<string, any>) {
    const { class_id, sender_name, content, color } = input;
    await this.assertClassFeature(Number(class_id), 'enable_danmaku');
    const id = this.repository.insertDanmaku({
      classId: class_id,
      senderName: sender_name,
      content,
      color: color || '#ffffff',
    });

    return this.repository.findDanmaku(id);
  }

  cleanupDanmakuMessages() {
    this.repository.cleanupDanmaku(1000);
  }
}
