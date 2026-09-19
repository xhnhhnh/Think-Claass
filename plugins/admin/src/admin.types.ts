/**
 * The admin plugin's internal seams.
 *
 * Two interfaces, both there so the service can be tested without a database or a machine:
 *
 *   - `AdminRepository` - everything the console reads or writes in tables **this plugin owns**
 *     (`api_keys`, `schools`, `announcements`), the cross-domain statistics read, the audit-log
 *     read, and the platform settings the kernel stores. Synchronous: `ctx.db` wraps
 *     better-sqlite3, and a promise here would only hide that.
 *   - `AdminRuntime` - the host statistics (`os.totalmem()` and friends), so the numbers
 *     `/api/admin/system/stats` reports are testable.
 *
 * Everything that belongs to *another* domain - teachers and activation codes (identity), the
 * classes and students a deletion covers (classroom), the database file (the host) - is a port call
 * in `admin.service.ts`, not a method here.
 */

import type {
  AdminActor,
  AdminAnnouncementListItem,
  AdminMutationResult,
  SystemDatabaseStats,
  SystemSettings,
  UpsertAdminAnnouncementInput,
} from '@thinkclass/contracts/domains/admin';
import type { AdminAuditEntry } from '@thinkclass/contracts/domains/identity';

/** The acting administrator, as much of it as an audit entry needs. */
export interface AdminMutationActor {
  id: number | null;
  role: string | null;
}

export interface AuditLogQuery {
  teacher_id?: string;
  user_id?: string;
  action?: string;
  limit?: string | number;
  offset?: string | number;
}

export interface AuditLogPage {
  data: unknown[];
  total: number;
}

export interface AdminRepository {
  getSystemDatabaseStats(): SystemDatabaseStats;
  getSystemSettings(): SystemSettings;
  saveSystemSettings(input: Partial<SystemSettings>): SystemSettings;

  listAnnouncements(): AdminAnnouncementListItem[];
  createAnnouncement(
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): AdminAnnouncementListItem;
  updateAnnouncement(
    id: number,
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): AdminAnnouncementListItem;
  deleteAnnouncement(id: number, actor: AdminMutationActor, ipAddress: string): AdminMutationResult;

  listAuditLogs(query: AuditLogQuery): AuditLogPage;

  // The OpenAPI surface: `api_keys` and `schools`, which had no owner before this plugin.
  listApiKeys(): Array<Record<string, unknown>>;
  createApiKey(input: Record<string, unknown>): Record<string, unknown> | undefined;
  deleteApiKey(id: string): void;
  listSchools(): Array<Record<string, unknown>>;
  createSchool(input: Record<string, unknown>): Record<string, unknown> | undefined;
  updateSchool(id: string, input: Record<string, unknown>): Record<string, unknown> | undefined;
  deleteSchool(id: string): void;
}

export interface AdminMaintenanceService {
  exportDatabase(): Promise<{ filePath: string; fileName: string }>;
  importDatabase(uploadedFilePath: string): Promise<{ message: string; reloaded: boolean; backupRestored: boolean }>;
  resetDatabase(): Promise<void>;
}

export interface AdminRuntime {
  totalmem(): number;
  freemem(): number;
  cpus(): import('os').CpuInfo[];
  uptime(): number;
  platform(): NodeJS.Platform;
}

/** Re-exported so the service can type an audit entry without importing the contracts path twice. */
export type { AdminAuditEntry, AdminActor };
