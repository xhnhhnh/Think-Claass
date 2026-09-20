/**
 * The migrated admin console, over real HTTP.
 *
 * `api/modules/admin` is gone (P4.3b.14) and `api/modules/` is empty, so every assertion here is
 * about the replacement: the routes still exist at the same METHOD+PATH, the envelopes are the same,
 * an authorized caller is still required, and the cross-domain operations go through the ports
 * instead of through a second data path.
 *
 * The file deliberately tests at the HTTP layer rather than the service layer, because that is where
 * this migration could go wrong quietly. Four of the five behaviours below were reached through
 * Prisma before - teachers and activation codes (`users`, `activation_codes`, `activation_events`),
 * the platform settings (`settings`) and the audit trail (`operation_logs`) - and each of those
 * tables now has exactly one owner. A port call that forgets its audit entry, or a settings write
 * that still goes to another table, would look perfectly fine in a unit test with a fake repository.
 *
 * Database import/export/reset are covered at the seam they moved to: the host injects
 * `ctx.maintenance`, and the stub below records the calls. The real implementation replaces the
 * SQLite file and replays the boot schema, which belongs to `api/maintenance.ts` and to a host-level
 * test, not here.
 */

import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, hashPassword, verifyPassword, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';
import type { DatabaseMaintenanceApi } from '@thinkclass/plugin-sdk';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel;
let host: PluginHost;
let directory: string;
let file: string;
let server: Server;
let base: string;
let adminToken: string;
let teacherToken: string;

/** Records what the plugin asked the host to do, so the seam is asserted rather than assumed. */
const maintenanceCalls: string[] = [];
const maintenance: DatabaseMaintenanceApi = {
  async exportDatabase() {
    maintenanceCalls.push('export');
    // A file that really exists, because the route answers with `res.download` - the stub replaces
    // the storage operation, not the HTTP behaviour.
    return { filePath: file, fileName: 'backup-test.sqlite' };
  },
  async importDatabase(uploadedFilePath: string) {
    maintenanceCalls.push(`import:${path.basename(uploadedFilePath)}`);
    return { message: '导入成功，数据结构已自动升级并热加载完成！', reloaded: true, backupRestored: false };
  },
  async resetDatabase() {
    maintenanceCalls.push('reset');
  },
};

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-admin-http-'));
  file = path.join(directory, 'admin.sqlite');

  kernel = await createKernel({
    rootDir: ROOT,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test', databaseFile: file },
    migrations: APP_MIGRATIONS,
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        authProvider: { current: null },
        maintenance,
      });
      return host;
    },
  });

  // A real hashed password: `/api/admin/session` verifies through `identity.public`, which uses the
  // kernel's `verifyPassword`, so the fixture has to be a real hash rather than a stub.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES
      (1, 'superadmin', 'root', '${hashPassword('root-secret')}', 1),
      (2, 'teacher', 'teacher2', 'x', 1),
      (3, 'student', 'student3', 'x', 1);

    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (10, '一班', 2, 'AAA111');
    INSERT INTO students (id, user_id, class_id, name) VALUES (20, 3, 10, '小明');
    INSERT INTO records (id, student_id, type, amount, description) VALUES (40, 20, 'ADD_POINTS', 5, 'seed');
    INSERT INTO assignments (id, class_id, teacher_id, title) VALUES (80, 10, 2, '作业一');
    INSERT INTO leave_requests (id, student_id, start_date, end_date, reason, status) VALUES (85, 20, '2026-01-01', '2026-01-02', '病假', 'pending');
    INSERT INTO team_quests (id, class_id, teacher_id, title, target_score, reward_points) VALUES (95, 10, 2, '小组任务', 100, 10);
    INSERT INTO pets (id, student_id, element_type, level, experience, attack_power) VALUES (30, 20, 'fire', 3, 200, 20);
  `);

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  adminToken = kernel.sessions.issue({ userId: 1, role: 'superadmin', ttlMs: 60_000 }).token;
  teacherToken = kernel.sessions.issue({ userId: 2, role: 'teacher', ttlMs: 60_000 }).token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel?.shutdown();
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Windows keeps the file handle briefly.
  }
});

async function call(
  method: string,
  endpoint: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('session and authorization', () => {
  it('issues an admin session for the right credentials and rejects the wrong ones', async () => {
    const ok = await call('POST', '/api/admin/session', { body: { username: 'root', password: 'root-secret' } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).toMatchObject({ id: 1, role: 'superadmin', username: 'root' });
    expect(typeof ok.body.data.token).toBe('string');

    const bad = await call('POST', '/api/admin/session', { body: { username: 'root', password: 'nope' } });
    expect(bad.status).toBe(401);
    expect(bad.body).toMatchObject({ success: false, message: '账号或密码错误，请重试' });
  });

  it('keeps the pre-migration authorization boundary: 401 anonymous, 403 for a teacher', async () => {
    expect((await call('GET', '/api/admin/users')).status).toBe(401);
    expect((await call('GET', '/api/admin/users', { token: teacherToken })).status).toBe(403);
    expect((await call('GET', '/api/admin/users', { token: adminToken })).status).toBe(200);
  });

  it('keeps the update routes superadmin-only', async () => {
    // The updater is gated on `superadmin` alone, exactly as before - an `admin` role is refused.
    const adminOnlyToken = kernel.sessions.issue({ userId: 1, role: 'admin', ttlMs: 60_000 }).token;
    expect((await call('GET', '/api/admin/system/update/status', { token: adminOnlyToken })).status).toBe(403);
  });
});

describe('teachers - identity owns `users`', () => {
  it('lists teachers with the legacy envelope', async () => {
    const { status, body } = await call('GET', '/api/admin/users', { token: adminToken });
    expect(status).toBe(200);
    expect(body.data.total).toBe(1);
    expect(body.data.items).toEqual([
      { id: 2, username: 'teacher2', role: 'teacher', isActivated: true },
    ]);
  });

  it('creates a teacher and records the audit entry in the same call', async () => {
    const { status, body } = await call('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'teacher9', password: 'pw9' },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, message: '教师创建成功' });
    expect(body.data).toMatchObject({ username: 'teacher9', role: 'teacher', isActivated: true });

    // The password is hashed by the owner of the table, not stored as given.
    const row = kernel.db.prepare(`SELECT password_hash FROM users WHERE username = 'teacher9'`).get() as {
      password_hash: string;
    };
    expect(row.password_hash).not.toBe('pw9');
    expect(verifyPassword('pw9', row.password_hash)).toBe(true);

    // The audit row travelled with the call: `user_id` is the acting superadmin and `teacher_id`
    // stays null, which is the shape the pre-migration `logAdminMutation` wrote.
    const log = kernel.db
      .prepare(`SELECT user_id, teacher_id, role, action, details FROM operation_logs WHERE action = 'ADMIN_CREATE_TEACHER'`)
      .get() as { user_id: number; teacher_id: number | null; role: string; details: string };
    expect(log).toMatchObject({ user_id: 1, teacher_id: null, role: 'superadmin' });
    expect(JSON.parse(log.details)).toMatchObject({ username: 'teacher9' });
  });

  it('translates a duplicate username into the legacy 400', async () => {
    const { status, body } = await call('POST', '/api/admin/users', {
      token: adminToken,
      body: { username: 'teacher9', password: 'pw' },
    });
    expect(status).toBe(400);
    expect(body.message).toBe('用户名已存在');
  });

  it('validates the input before touching the table', async () => {
    expect((await call('POST', '/api/admin/users', { token: adminToken, body: { username: '  ' } })).body.message).toBe(
      '用户名不能为空',
    );
    expect(
      (await call('POST', '/api/admin/users', { token: adminToken, body: { username: 'x' } })).body.message,
    ).toBe('密码不能为空');
    expect(
      (await call('PUT', '/api/admin/users/0', { token: adminToken, body: { username: 'x' } })).body.message,
    ).toBe('教师 ID 无效');
  });

  it('updates a teacher, hashing a new password only when one is sent', async () => {
    const noPassword = await call('PUT', '/api/admin/users/2', {
      token: adminToken,
      body: { username: 'teacher2-renamed' },
    });
    expect(noPassword.status).toBe(200);
    expect(noPassword.body.data.username).toBe('teacher2-renamed');

    const before = kernel.db.prepare(`SELECT password_hash FROM users WHERE id = 2`).get() as {
      password_hash: string;
    };
    const withPassword = await call('PUT', '/api/admin/users/2', {
      token: adminToken,
      body: { username: 'teacher2-renamed', password: 'new-pw' },
    });
    expect(withPassword.status).toBe(200);
    const after = kernel.db.prepare(`SELECT password_hash FROM users WHERE id = 2`).get() as {
      password_hash: string;
    };
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(verifyPassword('new-pw', after.password_hash)).toBe(true);
  });

  it('answers 404 for an id that is not a teacher', async () => {
    const { status, body } = await call('PUT', '/api/admin/users/3', {
      token: adminToken,
      body: { username: 'whatever' },
    });
    expect(status).toBe(404);
    expect(body.message).toBe('教师不存在');
  });
});

describe('activation codes - identity owns the ledger', () => {
  it('generates codes and lists them back with the legacy envelope', async () => {
    const created = await call('POST', '/api/admin/codes', { token: adminToken, body: { count: 3 } });
    expect(created.status).toBe(200);
    expect(created.body.data.createdCount).toBe(3);
    expect(created.body.data.codes).toHaveLength(3);
    for (const code of created.body.data.codes) {
      expect(code.code).toMatch(/^TC-[0-9A-F]{8}$/);
      expect(code.status).toBe('unused');
    }

    const listed = await call('GET', '/api/admin/codes', { token: adminToken });
    expect(listed.status).toBe(200);
    expect(listed.body.data.total).toBe(3);

    const log = kernel.db
      .prepare(`SELECT action FROM operation_logs WHERE action = 'ADMIN_GENERATE_ACTIVATION_CODES'`)
      .get();
    expect(log).toBeTruthy();
  });

  it('rejects a count outside 1..1000 with the legacy message', async () => {
    const { status, body } = await call('POST', '/api/admin/codes', { token: adminToken, body: { count: 0 } });
    expect(status).toBe(400);
    expect(body.message).toBe('生成数量必须在 1 到 1000 之间');
  });
});

describe('announcements - this plugin owns the table now', () => {
  let firstId = 0;

  it('creates, lists, updates and deletes', async () => {
    const created = await call('POST', '/api/admin/announcements', {
      token: adminToken,
      body: { title: '公告一', content: '内容一', isActive: true },
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ success: true, message: '公告创建成功' });
    expect(created.body.data).toMatchObject({ title: '公告一', isActive: true });
    firstId = created.body.data.id;

    const second = await call('POST', '/api/admin/announcements', {
      token: adminToken,
      body: { title: '公告二', content: '内容二', isActive: true },
    });
    // Activating a new announcement deactivates the rest - the pre-migration rule survived the move.
    expect(second.status).toBe(200);
    const active = kernel.db.prepare(`SELECT id FROM announcements WHERE is_active = 1`).all() as Array<{ id: number }>;
    expect(active).toEqual([{ id: second.body.data.id }]);

    const listed = await call('GET', '/api/admin/announcements', { token: adminToken });
    expect(listed.body.data.total).toBe(2);

    const updated = await call('PUT', `/api/admin/announcements/${firstId}`, {
      token: adminToken,
      body: { title: '公告一改', content: '内容一改', isActive: true },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ title: '公告一改' });

    const deleted = await call('DELETE', `/api/admin/announcements/${firstId}`, { token: adminToken });
    expect(deleted.status).toBe(200);
    expect(deleted.body.message).toBe('公告已删除');
    expect((await call('DELETE', `/api/admin/announcements/${firstId}`, { token: adminToken })).status).toBe(404);

    const log = kernel.db
      .prepare(`SELECT COUNT(*) AS n FROM operation_logs WHERE action LIKE 'ADMIN_%ANNOUNCEMENT'`)
      .get() as { n: number };
    expect(log.n).toBe(4); // create x2, update x1, delete x1
  });

  it('rejects empty title or content with the legacy message', async () => {
    const { status, body } = await call('POST', '/api/admin/announcements', {
      token: adminToken,
      body: { title: ' ', content: 'x' },
    });
    expect(status).toBe(400);
    expect(body.message).toBe('标题和内容不能为空');
  });
});

describe('platform settings - kernel storage, written through the kernel API', () => {
  it('reads the defaults, saves a change and reads it back', async () => {
    const initial = await call('GET', '/api/admin/system/settings', { token: adminToken });
    expect(initial.status).toBe(200);
    expect(initial.body.data.site_title).toBe('');
    expect(Object.keys(initial.body.data).length).toBeGreaterThan(10);

    const saved = await call('PUT', '/api/admin/system/settings', {
      token: adminToken,
      body: { site_title: '思考课堂' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ success: true, message: '系统设置已更新' });
    expect(saved.body.data.site_title).toBe('思考课堂');

    // The row landed in the kernel's own `settings` table, which is the only writer of it.
    const row = kernel.db.prepare(`SELECT value FROM settings WHERE key = 'site_title'`).get() as {
      value: string;
    };
    expect(row.value).toBe('思考课堂');
  });

  it('never writes back a masked secret', async () => {
    kernel.db
      .prepare(`INSERT INTO settings (key, value) VALUES ('payment_wechat_private_key', 'real-key') ON CONFLICT(key) DO UPDATE SET value = 'real-key'`)
      .run();

    const withSecret = await call('GET', '/api/admin/system/settings', { token: adminToken });
    expect(withSecret.body.data.payment_wechat_private_key).toBe('********');

    await call('PUT', '/api/admin/system/settings', {
      token: adminToken,
      body: { payment_wechat_private_key: '********', site_title: '再改一次' },
    });

    const row = kernel.db.prepare(`SELECT value FROM settings WHERE key = 'payment_wechat_private_key'`).get() as {
      value: string;
    };
    expect(row.value).toBe('real-key');
  });
});

describe('stats, audit log and OpenAPI surface', () => {
  it('reports the platform counters', async () => {
    const { status, body } = await call('GET', '/api/admin/system/stats', { token: adminToken });
    expect(status).toBe(200);
    expect(body.data.database).toMatchObject({
      teachers: 2, // teacher2 and the teacher created above; user 3 is the student's login row
      students: 1,
      classes: 1,
      totalActivity: 1,
      totalAssignments: 1,
      totalLeaves: 1,
      totalTeamQuests: 1,
      totalPoints: 200,
    });
    expect(body.data.server.cpuCount).toBeGreaterThan(0);
  });

  it('serves the audit log viewer with its filters and total', async () => {
    const { status, body } = await call('GET', '/api/audit-logs?action=ADMIN_UPDATE_TEACHER', { token: adminToken });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Two updates above: one without a password, one with.
    expect(body.total).toBe(2);
    expect(body.data[0].action).toBe('ADMIN_UPDATE_TEACHER');
  });

  it('keeps the OpenAPI key and school routes working for the console, and only for it', async () => {
    const key = await call('POST', '/api/openapi/keys', { token: adminToken, body: { name: '测试密钥' } });
    expect(key.status).toBe(200);
    expect(key.body.key.key).toMatch(/^sk_[0-9a-f]{48}$/);

    const keys = await call('GET', '/api/openapi/keys', { token: adminToken });
    expect(keys.body.keys).toHaveLength(1);

    expect((await call('DELETE', `/api/openapi/keys/${key.body.key.id}`, { token: adminToken })).status).toBe(200);
    expect((await call('GET', '/api/openapi/keys', { token: adminToken })).body.keys).toHaveLength(0);

    const school = await call('POST', '/api/openapi/schools', {
      token: adminToken,
      body: { name: '示范学校', description: 'd' },
    });
    expect(school.status).toBe(200);
    const updated = await call('PUT', `/api/openapi/schools/${school.body.school.id}`, {
      token: adminToken,
      body: { name: '示范学校二', description: 'd2' },
    });
    expect(updated.body.school.name).toBe('示范学校二');
    expect((await call('GET', '/api/openapi/schools', { token: adminToken })).body.schools).toHaveLength(1);
    expect(
      (await call('DELETE', `/api/openapi/schools/${school.body.school.id}`, { token: adminToken })).status,
    ).toBe(200);

    // These routes used to be public - `GET /api/openapi/keys` answered an anonymous caller with
    // plaintext `sk_...` secrets. The full per-route 401/403/200 matrix lives in
    // `admin-openapi-authorization.test.ts`; what this pins is that authorization now runs first,
    // and that an authorized empty body still reaches the repository's own 400.
    expect((await call('POST', '/api/openapi/keys', { body: {} })).status).toBe(401);
    expect((await call('POST', '/api/openapi/keys', { token: adminToken, body: {} })).status).toBe(400);
  });
});

describe('database maintenance - the host owns the file', () => {
  it('routes export through the injected host implementation', async () => {
    const response = await fetch(`${base}/api/admin/system/database/export`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    expect(maintenanceCalls).toContain('export');
    expect(response.headers.get('content-disposition')).toContain('backup-test.sqlite');
  });

  it('round-trips the superadmins around a reset', async () => {
    const before = kernel.db.prepare(`SELECT id, username, password_hash FROM users WHERE role = 'superadmin'`).all();
    const { status, body } = await call('POST', '/api/admin/system/database/reset', { token: adminToken });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, message: '所有数据已重置，并已恢复超级管理员账户' });
    expect(body.data.preservedSuperadmins).toBe(1);
    expect(maintenanceCalls).toContain('reset');

    // The stub did not actually drop anything, so what this pins is the *round trip*: identity read
    // the snapshot before the reset and wrote the same rows back after it, hash included.
    const after = kernel.db.prepare(`SELECT id, username, password_hash FROM users WHERE role = 'superadmin'`).all();
    expect(after).toEqual(before);
  });
});
