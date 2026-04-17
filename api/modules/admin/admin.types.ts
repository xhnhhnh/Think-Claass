import type {
  AdminActor,
  AdminAnnouncementListItem,
  AdminMutationResult,
  ActivationCodeListItem,
  DatabaseImportResult,
  GenerateActivationCodesInput,
  GenerateActivationCodesResult,
  SystemDatabaseStats,
  SystemSettings,
  TeacherDeleteResult,
  TeacherDetail,
  TeacherListItem,
  UpsertAdminAnnouncementInput,
  UpsertTeacherInput,
} from '../../../src/shared/admin/contracts.js';

export interface PreservedSuperadmin {
  id: number;
  username: string;
  passwordHash: string;
  isActivated: number;
}

export interface DatabaseExportPayload {
  filePath: string;
  fileName: string;
}

export interface AdminRepository {
  findAdminByCredentials(username: string, password: string): Promise<AdminActor | null>;
  getSystemDatabaseStats(): Promise<SystemDatabaseStats>;
  getSystemSettings(): Promise<SystemSettings>;
  saveSystemSettings(input: Partial<SystemSettings>): Promise<SystemSettings>;
  listTeachers(): Promise<TeacherListItem[]>;
  createTeacher(input: UpsertTeacherInput, actor: { id: number | null; role: string | null }, ipAddress: string): Promise<TeacherDetail>;
  updateTeacher(id: number, input: UpsertTeacherInput, actor: { id: number | null; role: string | null }, ipAddress: string): Promise<TeacherDetail>;
  deleteTeacher(id: number, actor: { id: number | null; role: string | null }, ipAddress: string): Promise<TeacherDeleteResult>;
  listActivationCodes(): Promise<ActivationCodeListItem[]>;
  generateActivationCodes(
    input: GenerateActivationCodesInput,
    actor: { id: number | null; role: string | null },
    ipAddress: string,
  ): Promise<GenerateActivationCodesResult>;
  listAnnouncements(): Promise<AdminAnnouncementListItem[]>;
  createAnnouncement(
    input: UpsertAdminAnnouncementInput,
    actor: { id: number | null; role: string | null },
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem>;
  updateAnnouncement(
    id: number,
    input: UpsertAdminAnnouncementInput,
    actor: { id: number | null; role: string | null },
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem>;
  deleteAnnouncement(
    id: number,
    actor: { id: number | null; role: string | null },
    ipAddress: string,
  ): Promise<AdminMutationResult>;
  listSuperadmins(): Promise<PreservedSuperadmin[]>;
  restoreSuperadmins(superadmins: PreservedSuperadmin[]): Promise<void>;
}

export interface AdminMaintenanceService {
  exportDatabase(): Promise<DatabaseExportPayload>;
  importDatabase(uploadedFilePath: string): Promise<DatabaseImportResult>;
  resetDatabase(): Promise<void>;
}

export interface AdminRuntime {
  totalmem(): number;
  freemem(): number;
  cpus(): import('os').CpuInfo[];
  uptime(): number;
  platform(): NodeJS.Platform;
}
