/**
 * The admin console's own storage.
 *
 * What lives here is exactly what this plugin owns or is allowed to read:
 *
 *   - `announcements` - the platform announcement feed. The pre-migration repository was its only
 *     writer and `plugins/engagement` only reads the active row, so ownership moved here in
 *     P4.3b.14 rather than a one-consumer port being invented for it.
 *   - `api_keys` and `schools` - the OpenAPI surface. Nobody owned them; the admin console was the
 *     only reader and writer in the repository.
 *   - `operation_logs` - **read-only**, and kernel-owned storage (the audit sink). The console's log
 *     viewer declares it in `data.reads`; the audit *writes* go through `ctx.audit`, never through
 *     this file.
 *   - the statistics counters, which are declared reads over tables other domains own: this is a
 *     dashboard that counts rows across the platform, and turning each count into a port would
 *     publish six single-integer APIs. `plugins/system`'s backup export is the same shape and is
 *     recorded the same way - as a declared read, not as a silent one.
 *   - platform settings, through `ctx.settings.getPlatform` / `setPlatform`: the `settings` table is
 *     kernel storage, and the key list plus the masking rules are this plugin's business vocabulary
 *     (see admin.defaults.ts).
 *
 * Everything that belongs to another domain - teachers, activation codes, classes, students - is a
 * port call in `admin.service.ts`.
 */

import crypto from 'crypto';

import type {
  AdminAnnouncementListItem,
  AdminMutationResult,
  SystemDatabaseStats,
  SystemSettings,
  UpsertAdminAnnouncementInput,
} from '@thinkclass/contracts/domains/admin';
import type { DbApi, KernelContext } from '@thinkclass/plugin-sdk';
import { ApiError } from '@thinkclass/kernel';

import { DEFAULT_SYSTEM_SETTINGS } from './admin.defaults.js';
import type {
  AdminMutationActor,
  AdminRepository as AdminRepositoryContract,
  AuditLogPage,
  AuditLogQuery,
} from './admin.types.js';

const SYSTEM_SETTING_KEYS = Object.keys(DEFAULT_SYSTEM_SETTINGS) as Array<keyof SystemSettings>;
const SENSITIVE_SETTING_KEYS = new Set<keyof SystemSettings>([
  'payment_wechat_private_key',
  'payment_wechat_api_v3_key',
  'payment_alipay_private_key',
  'payment_alipay_public_key',
]);
const MASKED_SETTING_VALUE = '********';

const API_KEY_COLUMNS = 'id, name, key, created_at, last_used_at, is_active';

function toIsoString(value: string | null | undefined): string | null {
  // SQLite hands back `YYYY-MM-DD HH:MM:SS`; the pre-migration mapper passed strings through
  // unchanged and the console renders them as-is, so this deliberately does not reformat.
  return value ?? null;
}

function mapAnnouncementRecord(record: {
  id: number;
  title: string;
  content: string;
  created_at: string | null;
  is_active: number | null;
}): AdminAnnouncementListItem {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    createdAt: toIsoString(record.created_at),
    isActive: record.is_active === 1,
  };
}

function count(db: DbApi, sql: string, params: Array<string | number> = []): number {
  const row = db.get<{ n: number }>(sql, params);
  return row?.n ?? 0;
}

export interface AdminRepositoryOptions {
  ctx: KernelContext;
}

export class SqliteAdminRepository implements AdminRepositoryContract {
  private readonly db: DbApi;
  private readonly ctx: KernelContext;

  constructor(options: AdminRepositoryOptions) {
    this.ctx = options.ctx;
    this.db = options.ctx.db;
  }

  /** The audit entry the pre-migration `logAdminMutation` wrote inside the caller's transaction. */
  private audit(
    actor: AdminMutationActor,
    action: string,
    detail: string,
    ipAddress: string,
  ): void {
    this.ctx.audit.record({
      action,
      detail,
      actorId: actor.id,
      // The console's own rows carry `user_id` and leave the historical `teacher_id` null -
      // `AuditLog.record` defaults `teacher_id` to the actor, so it is set explicitly.
      teacherId: null,
      role: actor.role,
      ip: ipAddress || null,
    });
  }

  getSystemDatabaseStats(): SystemDatabaseStats {
    const teachers = count(this.db, `SELECT COUNT(*) AS n FROM users WHERE role = 'teacher'`);
    const students = count(this.db, `SELECT COUNT(*) AS n FROM users WHERE role = 'student'`);
    const classes = count(this.db, `SELECT COUNT(*) AS n FROM classes`);
    const totalActivity = count(this.db, `SELECT COUNT(*) AS n FROM records`);
    const totalAssignments = count(this.db, `SELECT COUNT(*) AS n FROM assignments`);
    const totalLeaves = count(this.db, `SELECT COUNT(*) AS n FROM leave_requests`);
    const totalTeamQuests = count(this.db, `SELECT COUNT(*) AS n FROM team_quests`);
    const totalPointsRow = this.db.get<{ total: number | null }>(
      `SELECT SUM(experience) AS total FROM pets`,
    );

    return {
      totalUsers: teachers + students,
      teachers,
      students,
      classes,
      totalActivity,
      totalAssignments,
      totalLeaves,
      totalTeamQuests,
      totalPoints: totalPointsRow?.total ?? 0,
    };
  }

  getSystemSettings(): SystemSettings {
    const nextSettings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS };

    for (const key of SYSTEM_SETTING_KEYS) {
      const value = this.ctx.settings.getPlatform<string>(key);
      if (value === undefined || value === null) continue;
      nextSettings[key] = SENSITIVE_SETTING_KEYS.has(key) && value ? MASKED_SETTING_VALUE : value;
    }

    return nextSettings;
  }

  saveSystemSettings(input: Partial<SystemSettings>): SystemSettings {
    for (const key of SYSTEM_SETTING_KEYS) {
      const value = input[key];
      if (value === undefined) continue;
      // A masked field comes back from the browser unchanged when the operator did not touch it;
      // writing the mask would erase the real key.
      if (SENSITIVE_SETTING_KEYS.has(key) && value === MASKED_SETTING_VALUE) continue;
      this.ctx.settings.setPlatform(key, String(value));
    }

    return this.getSystemSettings();
  }

  // -- announcements --------------------------------------------------------

  listAnnouncements(): AdminAnnouncementListItem[] {
    const rows = this.db.query<{
      id: number;
      title: string;
      content: string;
      created_at: string | null;
      is_active: number | null;
    }>(`SELECT id, title, content, created_at, is_active FROM announcements ORDER BY created_at DESC`);

    return rows.map(mapAnnouncementRecord);
  }

  createAnnouncement(
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): AdminAnnouncementListItem {
    return this.db.tx(() => {
      // Only one announcement is active at a time; activating a new one deactivates the rest.
      if (input.isActive) {
        this.db.run(`UPDATE announcements SET is_active = 0`);
      }

      const info = this.db.run(`INSERT INTO announcements (title, content, is_active) VALUES (?, ?, ?)`, [
        input.title,
        input.content,
        input.isActive ? 1 : 0,
      ]);

      const created = this.db.get<{
        id: number;
        title: string;
        content: string;
        created_at: string | null;
        is_active: number | null;
      }>(`SELECT id, title, content, created_at, is_active FROM announcements WHERE id = ?`, [
        Number(info.lastInsertRowid),
      ]);

      this.audit(
        actor,
        'ADMIN_CREATE_ANNOUNCEMENT',
        JSON.stringify({ announcementId: created?.id ?? null, isActive: input.isActive }),
        ipAddress,
      );

      return mapAnnouncementRecord(created as NonNullable<typeof created>);
    });
  }

  updateAnnouncement(
    id: number,
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): AdminAnnouncementListItem {
    return this.db.tx(() => {
      const existing = this.db.get<{ id: number }>(`SELECT id FROM announcements WHERE id = ?`, [id]);
      if (!existing) throw new ApiError(404, '公告不存在');

      if (input.isActive) {
        this.db.run(`UPDATE announcements SET is_active = 0 WHERE id <> ?`, [id]);
      }

      this.db.run(`UPDATE announcements SET title = ?, content = ?, is_active = ? WHERE id = ?`, [
        input.title,
        input.content,
        input.isActive ? 1 : 0,
        id,
      ]);

      const updated = this.db.get<{
        id: number;
        title: string;
        content: string;
        created_at: string | null;
        is_active: number | null;
      }>(`SELECT id, title, content, created_at, is_active FROM announcements WHERE id = ?`, [id]);

      this.audit(
        actor,
        'ADMIN_UPDATE_ANNOUNCEMENT',
        JSON.stringify({ announcementId: id, isActive: input.isActive }),
        ipAddress,
      );

      return mapAnnouncementRecord(updated as NonNullable<typeof updated>);
    });
  }

  deleteAnnouncement(id: number, actor: AdminMutationActor, ipAddress: string): AdminMutationResult {
    return this.db.tx(() => {
      const existing = this.db.get<{ id: number; title: string }>(
        `SELECT id, title FROM announcements WHERE id = ?`,
        [id],
      );
      if (!existing) throw new ApiError(404, '公告不存在');

      this.db.run(`DELETE FROM announcements WHERE id = ?`, [id]);
      this.audit(
        actor,
        'ADMIN_DELETE_ANNOUNCEMENT',
        JSON.stringify({ announcementId: id, title: existing.title }),
        ipAddress,
      );

      return { message: '公告已删除' };
    });
  }

  // -- audit log viewer -----------------------------------------------------

  /**
   * The console's log list.
   *
   * Read-only over `operation_logs`, which the kernel's audit sink owns. Raw SQL (not `ctx.audit`)
   * because the sink publishes a writer, not a query surface, and the filters below are the admin
   * console's own presentation choice - `plugins/system` reads the same table the same way.
   */
  listAuditLogs(queryInput: AuditLogQuery): AuditLogPage {
    const { teacher_id, user_id, action, limit = 100, offset = 0 } = queryInput ?? {};

    let where = '';
    const params: Array<string | number> = [];

    if (teacher_id) {
      where += ' AND teacher_id = ?';
      params.push(teacher_id);
    }
    if (user_id) {
      where += ' AND user_id = ?';
      params.push(user_id);
    }
    if (action) {
      where += ' AND action = ?';
      params.push(action);
    }

    const rows = this.db.query(
      `SELECT * FROM operation_logs WHERE 1=1${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)],
    );

    const total = count(this.db, `SELECT COUNT(*) AS n FROM operation_logs WHERE 1=1${where}`, params);

    return { data: rows, total };
  }

  // -- OpenAPI keys and schools --------------------------------------------

  listApiKeys(): Array<Record<string, unknown>> {
    return this.db.query(`SELECT ${API_KEY_COLUMNS} FROM api_keys ORDER BY created_at DESC`);
  }

  createApiKey(input: Record<string, unknown>): Record<string, unknown> | undefined {
    const { name } = input ?? {};
    if (!name) throw new ApiError(400, '名称为必填项');

    const key = `sk_${crypto.randomBytes(24).toString('hex')}`;
    const info = this.db.run(`INSERT INTO api_keys (name, key) VALUES (?, ?)`, [String(name), key]);
    return this.db.get(`SELECT ${API_KEY_COLUMNS} FROM api_keys WHERE id = ?`, [Number(info.lastInsertRowid)]);
  }

  deleteApiKey(id: string): void {
    this.db.run(`DELETE FROM api_keys WHERE id = ?`, [id]);
  }

  listSchools(): Array<Record<string, unknown>> {
    return this.db.query(`SELECT * FROM schools ORDER BY created_at DESC`);
  }

  createSchool(input: Record<string, unknown>): Record<string, unknown> | undefined {
    const { name, description, contact_info } = input ?? {};
    if (!name) throw new ApiError(400, '校园名称为必填项');

    const info = this.db.run(`INSERT INTO schools (name, description, contact_info) VALUES (?, ?, ?)`, [
      String(name),
      description ? String(description) : '',
      contact_info ? String(contact_info) : '',
    ]);
    return this.db.get(`SELECT * FROM schools WHERE id = ?`, [Number(info.lastInsertRowid)]);
  }

  updateSchool(id: string, input: Record<string, unknown>): Record<string, unknown> | undefined {
    const { name, description, contact_info } = input ?? {};
    if (!name) throw new ApiError(400, '校园名称为必填项');

    this.db.run(`UPDATE schools SET name = ?, description = ?, contact_info = ? WHERE id = ?`, [
      String(name),
      description ? String(description) : '',
      contact_info ? String(contact_info) : '',
      id,
    ]);
    return this.db.get(`SELECT * FROM schools WHERE id = ?`, [id]);
  }

  deleteSchool(id: string): void {
    this.db.run(`DELETE FROM schools WHERE id = ?`, [id]);
  }
}
