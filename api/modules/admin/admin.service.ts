import os from 'os';

import type {
  AdminAnnouncementListItem,
  AdminMutationResult,
  GenerateActivationCodesInput,
  GenerateActivationCodesResult,
  AdminSession,
  DatabaseResetResult,
  SystemSettings,
  SystemStatsResponse,
  TeacherDeleteResult,
  TeacherDetail,
  TeacherListItem,
  UpsertAdminAnnouncementInput,
  UpsertTeacherInput,
} from '../../../src/shared/admin/contracts.js';
import { ApiError } from '../../utils/asyncHandler.js';
import type { RequestActor } from '../../utils/requestAuth.js';
import type { AdminMaintenanceService, AdminRepository, AdminRuntime } from './admin.types.js';

const defaultRuntime: AdminRuntime = {
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem(),
  cpus: () => os.cpus(),
  uptime: () => os.uptime(),
  platform: () => os.platform(),
};

export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly maintenance: AdminMaintenanceService,
    private readonly runtime: AdminRuntime = defaultRuntime,
  ) {}

  async createSession(username: string, password: string): Promise<AdminSession> {
    const user = await this.repository.findAdminByCredentials(username, password);

    if (!user) {
      throw new ApiError(401, '账号或密码错误，请重试');
    }

    return { user };
  }

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
      database: await this.repository.getSystemDatabaseStats(),
    };
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return this.repository.getSystemSettings();
  }

  async updateSystemSettings(input: Partial<SystemSettings>): Promise<SystemSettings> {
    return this.repository.saveSystemSettings(input);
  }

  async listTeachers(): Promise<TeacherListItem[]> {
    return this.repository.listTeachers();
  }

  async createTeacher(input: UpsertTeacherInput, actor: RequestActor, ipAddress: string): Promise<TeacherDetail> {
    const username = input.username.trim();
    const password = input.password?.trim() ?? '';

    if (!username) {
      throw new ApiError(400, '用户名不能为空');
    }

    if (!password) {
      throw new ApiError(400, '密码不能为空');
    }

    return this.repository.createTeacher({ username, password }, actor, ipAddress);
  }

  async updateTeacher(id: number, input: UpsertTeacherInput, actor: RequestActor, ipAddress: string): Promise<TeacherDetail> {
    const username = input.username.trim();
    const password = input.password?.trim();

    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, '教师 ID 无效');
    }

    if (!username) {
      throw new ApiError(400, '用户名不能为空');
    }

    return this.repository.updateTeacher(
      id,
      {
        username,
        ...(password ? { password } : {}),
      },
      actor,
      ipAddress,
    );
  }

  async deleteTeacher(id: number, actor: RequestActor, ipAddress: string): Promise<TeacherDeleteResult> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, '教师 ID 无效');
    }

    return this.repository.deleteTeacher(id, actor, ipAddress);
  }

  async listActivationCodes() {
    return this.repository.listActivationCodes();
  }

  async generateActivationCodes(
    input: GenerateActivationCodesInput,
    actor: RequestActor,
    ipAddress: string,
  ): Promise<GenerateActivationCodesResult> {
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new ApiError(400, '生成数量必须在 1 到 1000 之间');
    }

    return this.repository.generateActivationCodes({ count }, actor, ipAddress);
  }

  async listAnnouncements(): Promise<AdminAnnouncementListItem[]> {
    return this.repository.listAnnouncements();
  }

  async createAnnouncement(
    input: UpsertAdminAnnouncementInput,
    actor: RequestActor,
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem> {
    if (!input.title.trim() || !input.content.trim()) {
      throw new ApiError(400, '标题和内容不能为空');
    }

    return this.repository.createAnnouncement(
      {
        title: input.title.trim(),
        content: input.content.trim(),
        isActive: Boolean(input.isActive),
      },
      actor,
      ipAddress,
    );
  }

  async updateAnnouncement(
    id: number,
    input: UpsertAdminAnnouncementInput,
    actor: RequestActor,
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, '公告 ID 无效');
    }

    if (!input.title.trim() || !input.content.trim()) {
      throw new ApiError(400, '标题和内容不能为空');
    }

    return this.repository.updateAnnouncement(
      id,
      {
        title: input.title.trim(),
        content: input.content.trim(),
        isActive: Boolean(input.isActive),
      },
      actor,
      ipAddress,
    );
  }

  async deleteAnnouncement(id: number, actor: RequestActor, ipAddress: string): Promise<AdminMutationResult> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, '公告 ID 无效');
    }

    return this.repository.deleteAnnouncement(id, actor, ipAddress);
  }

  async exportDatabase() {
    return this.maintenance.exportDatabase();
  }

  async importDatabase(uploadedFilePath: string) {
    return this.maintenance.importDatabase(uploadedFilePath);
  }

  async resetDatabase(): Promise<DatabaseResetResult> {
    const superadmins = await this.repository.listSuperadmins();

    await this.maintenance.resetDatabase();
    await this.repository.restoreSuperadmins(superadmins);

    return {
      message: '所有数据已重置，并已恢复超级管理员账户',
      preservedSuperadmins: superadmins.length,
    };
  }
}
