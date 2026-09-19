/**
 * The admin console's service layer.
 *
 * The shape of this file is the whole point of the round. The pre-migration service was a thin
 * wrapper over a Prisma repository that wrote six other domains' tables; now every cross-domain
 * operation is a **port call**:
 *
 *   teachers, activation codes, superadmins   -> `identity.public`   (it owns `users`)
 *   the classes/students a deletion covers    -> `classroom.public`  (it owns `classes`/`students`)
 *   the database file (export/import/reset)   -> `ctx.maintenance`   (the host owns the connection)
 *   the audit trail of a deletion             -> `ctx.audit`         (the kernel owns `operation_logs`)
 *   everything this plugin owns               -> `admin.repository.ts`
 *
 * `DELETE /api/admin/users/:id` is the reason the round exists: it used to delete from 58 tables in
 * one Prisma transaction, which kept the database consistent while making every ownership rule
 * unenforceable. It now resolves the account's *scope* through the two domain owners and asks
 * `ctx.cleanup.run(subject)` to run every plugin's cleanup rule inside one transaction - so the
 * atomicity is kept and each table is deleted by the plugin that owns it. The ruling, and the
 * guardrails that keep it honest, are in `docs/migration/admin-cascade-decision.md`.
 */

import os from 'os';

import type {
  AdminAnnouncementListItem,
  AdminMutationResult,
  AdminSession,
  DatabaseResetResult,
  GenerateActivationCodesInput,
  GenerateActivationCodesResult,
  SystemSettings,
  SystemStatsResponse,
  TeacherDeleteResult,
  TeacherDetail,
  TeacherListItem,
  UpsertAdminAnnouncementInput,
} from '@thinkclass/contracts/domains/admin';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { IdentityPort } from '@thinkclass/contracts/domains/identity';
import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type {
  AdminMaintenanceService,
  AdminMutationActor,
  AdminRepository,
  AdminRuntime,
} from './admin.types.js';

const defaultRuntime: AdminRuntime = {
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem(),
  cpus: () => os.cpus(),
  uptime: () => os.uptime(),
  platform: () => os.platform(),
};

export interface AdminServiceOptions {
  ctx: KernelContext;
  repository: AdminRepository;
  /**
   * Resolved lazily, not captured: `admin` sorts before `identity` alphabetically, so a value
   * captured in `setup()` would be `undefined` forever (HANDOFF section 9 records this trap from
   * `plugins/challenge`). The registry is a live map and the contract requires both plugins.
   */
  identity: () => IdentityPort;
  classroom: () => ClassroomPort;
  runtime?: AdminRuntime;
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))];
}

export class AdminService {
  private readonly ctx: KernelContext;
  private readonly repository: AdminRepository;
  private readonly identity: () => IdentityPort;
  private readonly classroom: () => ClassroomPort;
  private readonly runtime: AdminRuntime;

  constructor(options: AdminServiceOptions) {
    this.ctx = options.ctx;
    this.repository = options.repository;
    this.identity = options.identity;
    this.classroom = options.classroom;
    this.runtime = options.runtime ?? defaultRuntime;
  }

  // -- session --------------------------------------------------------------

  async createSession(username: string, password: string): Promise<AdminSession> {
    const user = await this.identity().verifyAdminCredentials(username, password);

    if (!user) {
      throw new ApiError(401, '账号或密码错误，请重试');
    }

    return { user };
  }

  /**
   * Mint a session token for a verified console login.
   *
   * The kernel owns session policy, so the TTL comes from `ctx.config.sessionTtlMs` rather than an
   * environment variable read here - the same rule `plugins/identity` follows. The pre-migration
   * controller reached the kernel through the `getActiveKernel()` service locator; the context is
   * the supported path now.
   */
  issueSession(user: { id: number; role: string }, request: { userAgent?: string | null; ip?: string | null }) {
    return this.ctx.sessions.issue({
      userId: user.id,
      role: user.role as never,
      ttlMs: this.ctx.config.sessionTtlMs,
      userAgent: request.userAgent ?? null,
      ip: request.ip ?? null,
    });
  }

  // -- system ---------------------------------------------------------------

  async getSystemStats(): Promise<SystemStatsResponse> {
    const totalMem = this.runtime.totalmem();
    const freeMem = this.runtime.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = this.runtime.cpus();
    const cpuCount = cpus.length;
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const cpuUsage = totalTick === 0 ? 0 : Number((((totalTick - totalIdle) / totalTick) * 100).toFixed(2));
    const memUsage = totalMem === 0 ? 0 : Number(((usedMem / totalMem) * 100).toFixed(2));

    return {
      server: {
        cpuUsage,
        cpuCount,
        totalMem,
        usedMem,
        freeMem,
        memUsage,
        uptime: this.runtime.uptime(),
        platform: this.runtime.platform(),
      },
      database: this.repository.getSystemDatabaseStats(),
    };
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return this.repository.getSystemSettings();
  }

  async updateSystemSettings(input: Partial<SystemSettings>): Promise<SystemSettings> {
    return this.repository.saveSystemSettings(input);
  }

  // -- teachers (identity's table) -----------------------------------------

  async listTeachers(): Promise<TeacherListItem[]> {
    return this.identity().listTeachers();
  }

  async createTeacher(
    input: { username: string; password?: string },
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<TeacherDetail> {
    const username = String(input.username ?? '').trim();
    const password = String(input.password ?? '').trim();

    if (!username) throw new ApiError(400, '用户名不能为空');
    if (!password) throw new ApiError(400, '密码不能为空');

    return this.identity().createTeacher(
      { username, password },
      { action: 'ADMIN_CREATE_TEACHER', actorId: actor.id, role: actor.role, ip: ipAddress || null },
    );
  }

  async updateTeacher(
    id: number,
    input: { username: string; password?: string },
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<TeacherDetail> {
    const username = String(input.username ?? '').trim();
    const password = input.password === undefined ? undefined : String(input.password).trim();

    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, '教师 ID 无效');
    if (!username) throw new ApiError(400, '用户名不能为空');

    return this.identity().updateTeacher(
      id,
      { username, ...(password ? { password } : {}) },
      { action: 'ADMIN_UPDATE_TEACHER', actorId: actor.id, role: actor.role, ip: ipAddress || null },
    );
  }

  /**
   * Erase a teacher and everything their classes own.
   *
   * Three steps, and the order matters:
   *
   *   1. **Resolve the scope** through the two domain owners. `classes` and `students` are
   *      classroom's, `users` is identity's; guessing them here would be a second reader of another
   *      domain's storage, which is the debt this round is paying off.
   *   2. **One transaction**: purge the account's audit rows, run every plugin's cleanup rule, and
   *      write the summary entry. The pre-migration cascade deleted `operation_logs` rows and wrote
   *      its own entry in the same transaction, and the real-database test records why that is the
   *      right unit: "the delete and the record of the delete are one unit".
   *   3. Report the same counts and the same Chinese message as before.
   *
   * If any plugin's rule is missing, a foreign key fails the commit and *nothing* is deleted - which
   * is the property `tests/plugins/admin-cascade.test.ts` pins by disabling a domain plugin and
   * asserting the teacher survives.
   */
  async deleteTeacher(id: number, actor: AdminMutationActor, ipAddress: string): Promise<TeacherDeleteResult> {
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, '教师 ID 无效');

    const teacher = await this.identity().findTeacher(id);
    if (!teacher) throw new ApiError(404, '教师不存在');

    const classIds = await this.classroom().listClassIdsByTeacher(id);
    const accounts = await this.classroom().listStudentAccountsByClassIds(classIds);
    const studentIds = accounts.map((account) => account.studentId);
    const studentUserIds = uniqueNumbers(accounts.map((account) => account.userId));
    const affectedUserIds = uniqueNumbers([id, ...studentUserIds]);

    this.ctx.db.tx(() => {
      this.ctx.audit.purgeFor({ teacherIds: [id], userIds: affectedUserIds });

      this.ctx.cleanup.run({
        teacherIds: [id],
        classIds,
        studentIds,
        userIds: affectedUserIds,
      });

      this.ctx.audit.record({
        action: 'ADMIN_DELETE_TEACHER',
        detail: JSON.stringify({
          teacherId: id,
          teacherUsername: teacher.username,
          deletedClasses: classIds.length,
          deletedStudents: studentIds.length,
          deletedStudentUsers: studentUserIds.length,
        }),
        actorId: actor.id,
        teacherId: null,
        role: actor.role,
        ip: ipAddress || null,
      });
    });

    return {
      message: `教师 ${teacher.username} 及其相关班级和学生数据已删除`,
      deletedTeacherId: id,
      deletedClasses: classIds.length,
      deletedStudents: studentIds.length,
      deletedStudentUsers: studentUserIds.length,
    };
  }

  // -- activation codes (identity's table) ---------------------------------

  async listActivationCodes() {
    return this.identity().listActivationCodes();
  }

  async generateActivationCodes(
    input: GenerateActivationCodesInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<GenerateActivationCodesResult> {
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new ApiError(400, '生成数量必须在 1 到 1000 之间');
    }

    return this.identity().generateActivationCodes(
      { count },
      { action: 'ADMIN_GENERATE_ACTIVATION_CODES', actorId: actor.id, role: actor.role, ip: ipAddress || null },
    );
  }

  // -- announcements (this plugin's table) ---------------------------------

  async listAnnouncements(): Promise<AdminAnnouncementListItem[]> {
    return this.repository.listAnnouncements();
  }

  async createAnnouncement(
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem> {
    if (!String(input.title ?? '').trim() || !String(input.content ?? '').trim()) {
      throw new ApiError(400, '标题和内容不能为空');
    }

    return this.repository.createAnnouncement(
      { title: input.title.trim(), content: input.content.trim(), isActive: Boolean(input.isActive) },
      actor,
      ipAddress,
    );
  }

  async updateAnnouncement(
    id: number,
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem> {
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, '公告 ID 无效');
    if (!String(input.title ?? '').trim() || !String(input.content ?? '').trim()) {
      throw new ApiError(400, '标题和内容不能为空');
    }

    return this.repository.updateAnnouncement(
      id,
      { title: input.title.trim(), content: input.content.trim(), isActive: Boolean(input.isActive) },
      actor,
      ipAddress,
    );
  }

  async deleteAnnouncement(id: number, actor: AdminMutationActor, ipAddress: string): Promise<AdminMutationResult> {
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, '公告 ID 无效');
    return this.repository.deleteAnnouncement(id, actor, ipAddress);
  }

  // -- database maintenance (the host's file) ------------------------------

  async exportDatabase() {
    return this.ctx.maintenance.exportDatabase();
  }

  async importDatabase(uploadedFilePath: string) {
    return this.ctx.maintenance.importDatabase(uploadedFilePath);
  }

  /**
   * Reset everything, then put the superadmins back.
   *
   * The snapshot is read through identity *before* the tables are dropped and written back after -
   * the only way to keep an account the schema's seed does not know about. Both halves are identity
   * port calls; the drop-and-recreate in the middle is the host's, because it is about the file and
   * the application schema.
   */
  async resetDatabase(): Promise<DatabaseResetResult> {
    const superadmins = await this.identity().listSuperadmins();

    await this.ctx.maintenance.resetDatabase();
    await this.identity().restoreSuperadmins(superadmins);

    return {
      message: '所有数据已重置，并已恢复超级管理员账户',
      preservedSuperadmins: superadmins.length,
    };
  }
}
