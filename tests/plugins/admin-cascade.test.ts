/**
 * `DELETE /api/admin/users/:id`, end to end, on a real database - and the proof that the cleanup
 * mechanism is what does the deleting.
 *
 * Until P4.3b.14 this route ran one Prisma transaction that deleted from **58 tables by hard-coded
 * name**. It was atomic - there was no such thing as a half-deleted account - and it was invisible to
 * every ownership check the plugin runtime enforces, because Prisma does not go through `DbApi`. The
 * ruling (`docs/migration/admin-cascade-decision.md`) kept the atomicity and gave the table names
 * back to their owners: each plugin registers a cleanup rule for its own tables, and the runtime runs
 * all of them inside one transaction, ordered from the schema's foreign keys.
 *
 * This file tests the result at the only level that can: real HTTP, real routes, a real SQLite file,
 * seeded rows in ten domains. It replaces the previous version, which constructed
 * `PrismaAdminRepository` directly - the repository no longer exists, and neither does the second
 * data path it used.
 *
 * ## The two cases that matter
 *
 *   1. **The cascade works**: the teacher, their class, their student, the student's login, and the
 *      rows nine other domains owned are all gone - while the tables the cascade never touched
 *      (`announcements`, `api_keys`) are untouched.
 *   2. **The mechanism is load-bearing**: on a host where the `pet` plugin is disabled, the same
 *      request **fails loudly and deletes nothing**. That is the assertion that goes red if somebody
 *      "simplifies" the cascade back into direct deletes - because then disabling a domain plugin
 *      would no longer matter - and it is also the atomicity check: a partial delete would leave the
 *      teacher row gone and the student rows present.
 */

import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Booted {
  kernel: Kernel;
  host: PluginHost;
  server: Server;
  base: string;
  directory: string;
}

const booted: Booted[] = [];

/**
 * Boot a real kernel with the real plugins, on a private SQLite file.
 *
 * A file (not `:memory:`) because the assertions read the same database from a second connection
 * after the request, and because `disabled` needs two independent hosts to be compared honestly.
 */
async function boot(options: { disabled?: string[] } = {}): Promise<Booted> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-admin-cascade-'));
  const file = path.join(directory, 'cascade.sqlite');
  let host: PluginHost | null = null;

  const kernel = await createKernel({
    rootDir: ROOT,
    overrides: {
      logLevel: 'silent',
      pluginsEnabled: true,
      pluginDirs: [],
      env: 'test',
      databaseFile: file,
    },
    migrations: APP_MIGRATIONS,
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        authProvider: { current: null },
        ...(options.disabled ? { disabled: options.disabled } : {}),
      });
      return host;
    },
  });

  if (!host) throw new Error('plugin host did not mount');

  const server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const port = (server.address() as { port: number }).port;

  const entry: Booted = { kernel, host, server, base: `http://127.0.0.1:${port}`, directory };
  booted.push(entry);
  return entry;
}

afterAll(async () => {
  for (const entry of booted) {
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
    await entry.host.stop();
    await entry.kernel.shutdown();
    try {
      fs.rmSync(entry.directory, { recursive: true, force: true });
    } catch {
      // Windows keeps the file handle briefly; the OS reclaims its temp directory.
    }
  }
});

/**
 * One teacher with rows across ten domains, plus two rows the cascade must NOT touch.
 *
 * Seeded with raw SQL rather than through plugins: the fixture must not depend on the code under
 * test, and a plugin-orchestrated seed would pre-create exactly the references this test is about.
 * Student id 20 has a login row (user 3) so the cascade's `users` half is exercised too, and
 * superadmin 1 is the acting account - it must survive.
 */
function seed(kernel: Kernel): void {
  const db = kernel.db;
  db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES
      (1, 'superadmin', 'root', 'x', 1),
      (2, 'teacher', 'teacher2', 'x', 1),
      (3, 'student', 'student3', 'x', 1);

    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (10, '一班', 2, 'AAA111');
    INSERT INTO students (id, user_id, class_id, name) VALUES (20, 3, 10, '小明');

    INSERT INTO pets (id, student_id, element_type, level, experience, attack_power) VALUES (30, 20, 'fire', 3, 200, 20);
    INSERT INTO records (id, student_id, type, amount, description) VALUES (40, 20, 'ADD_POINTS', 5, 'seed');
    INSERT INTO praises (id, teacher_id, student_id, content) VALUES (50, 2, 20, '不错');
    INSERT INTO certificates (id, student_id, title) VALUES (60, 20, '进步之星');
    INSERT INTO attendance_records (id, class_id, student_id, status, date) VALUES (70, 10, 20, 'present', '2026-01-01');
    INSERT INTO assignments (id, class_id, teacher_id, title) VALUES (80, 10, 2, '作业一');
    INSERT INTO student_assignments (id, assignment_id, student_id, status) VALUES (90, 80, 20, 'pending');
    INSERT INTO team_quests (id, class_id, teacher_id, title, target_score, reward_points) VALUES (95, 10, 2, '小组任务', 100, 10);
    INSERT INTO payment_orders (id, user_id, order_no, source, payment_method, amount, status) VALUES (110, 2, 'TC-ORDER-1', 'activation_code', 'mock', 99, 'PAID');
    INSERT INTO payment_transactions (id, order_id, transaction_type, status, provider) VALUES (120, 110, 'CREATE', 'AWAITING_PAYMENT', 'mock');

    -- Not part of the cascade: the console owns these, and a teacher deletion must not touch them.
    INSERT INTO announcements (id, title, content, is_active) VALUES (140, '平台公告', '内容', 1);
    INSERT INTO api_keys (id, name, key) VALUES (150, '测试密钥', 'sk_test');

    -- The audit row the cascade is supposed to purge, and the one it writes afterwards.
    INSERT INTO operation_logs (id, teacher_id, action) VALUES (160, 2, 'SEED');
  `);
}

const api = (entry: Booted, method: string, path: string, token: string) =>
  fetch(entry.base + path, { method, headers: { authorization: `Bearer ${token}` } });

function count(entry: Booted, table: string): number {
  return (entry.kernel.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('DELETE /api/admin/users/:id', () => {
  let main: Booted;
  let token: string;

  beforeAll(async () => {
    main = await boot();
    seed(main.kernel);
    token = main.kernel.sessions.issue({ userId: 1, role: 'superadmin', ttlMs: 60_000 }).token;
  });

  it('refuses an anonymous caller before touching anything', async () => {
    const response = await fetch(`${main.base}/api/admin/users/2`, { method: 'DELETE' });
    expect(response.status).toBe(401);
    expect(count(main, 'users')).toBe(3);
  });

  it('answers 404 for an id that is not a teacher, and changes nothing', async () => {
    const response = await api(main, 'DELETE', '/api/admin/users/1', token);
    expect(response.status).toBe(404);
    expect(count(main, 'users')).toBe(3);
  });

  it('removes the teacher, their classes, their students and everything those students own', async () => {
    const response = await api(main, 'DELETE', '/api/admin/users/2', token);
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      deletedTeacherId: 2,
      deletedClasses: 1,
      deletedStudents: 1,
      deletedStudentUsers: 1,
    });
    expect(String(body.message)).toContain('teacher2');

    // The identifying rows: the teacher, the student's login, the class, the student.
    expect(count(main, 'users')).toBe(1); // superadmin 1 survives
    expect(count(main, 'classes')).toBe(0);
    expect(count(main, 'students')).toBe(0);

    // ...and the rows nine other plugins now delete through their own cleanup rules. Before this
    // round each of these was a hard-coded table name in the admin repository.
    expect(count(main, 'pets')).toBe(0);
    expect(count(main, 'records')).toBe(0);
    expect(count(main, 'praises')).toBe(0);
    expect(count(main, 'certificates')).toBe(0);
    expect(count(main, 'attendance_records')).toBe(0);
    expect(count(main, 'assignments')).toBe(0);
    expect(count(main, 'student_assignments')).toBe(0);
    expect(count(main, 'team_quests')).toBe(0);
    expect(count(main, 'payment_transactions')).toBe(0);
    expect(count(main, 'payment_orders')).toBe(0);

    // The console's own tables are not part of an account deletion.
    expect(count(main, 'announcements')).toBe(1);
    expect(count(main, 'api_keys')).toBe(1);
  });

  it('purges the account audit rows and writes its own summary in the same transaction', async () => {
    const rows = main.kernel.db
      .prepare(`SELECT user_id, teacher_id, role, action, details, ip_address FROM operation_logs ORDER BY id`)
      .all() as Array<{
      user_id: number | null;
      teacher_id: number | null;
      role: string | null;
      action: string;
      details: string;
      ip_address: string | null;
    }>;

    // Two rows: the seeded one for the deleted teacher is purged by `ctx.audit.purgeFor`, and the
    // summary row is written by `ctx.audit.record` in the same transaction. Asserting 1 here was the
    // first version of the pre-migration test, and it was wrong for an instructive reason: the delete
    // and the record of the delete are one unit.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'ADMIN_DELETE_TEACHER', user_id: 1, role: 'superadmin' });
    // `teacher_id` stays null for the console's own entries, exactly as the pre-migration
    // `logAdminMutation` wrote them - `ctx.audit.record` defaults it to the actor, so it is explicit.
    expect(rows[0].teacher_id).toBeNull();
    expect(JSON.parse(rows[0].details)).toMatchObject({ teacherId: 2, deletedClasses: 1, deletedStudents: 1 });
  });

  it('reports the missing teacher again on a second call', async () => {
    const response = await api(main, 'DELETE', '/api/admin/users/2', token);
    expect(response.status).toBe(404);
    expect(count(main, 'users')).toBe(1);
  });
});

describe('the cleanup rules are what deletes - not a hard-coded list in the admin plugin', () => {
  let withoutPet: Booted;
  let token: string;

  beforeAll(async () => {
    // `pet` disabled: its cleanup rule is never registered, so nothing removes the `pets` rows that
    // reference the students this deletion is about.
    withoutPet = await boot({ disabled: ['pet'] });
    seed(withoutPet.kernel);
    token = withoutPet.kernel.sessions.issue({ userId: 1, role: 'superadmin', ttlMs: 60_000 }).token;
  });

  it('did not activate the disabled plugin', () => {
    expect(withoutPet.host.active.map((entry) => entry.manifest.id)).not.toContain('pet');
    expect(withoutPet.host.cleanup.tables()).not.toContain('pets');
  });

  it('fails loudly and deletes nothing when a domain owner does not participate', async () => {
    const response = await api(withoutPet, 'DELETE', '/api/admin/users/2', token);
    expect(response.status).toBe(500);

    // Atomicity: the foreign key from `pets.student_id` to `students.id` is enforced immediately, so
    // the transaction rolls back as a whole. Nothing is half-deleted - not the students, not the
    // class, not the teacher, not the rows whose rules did run.
    expect(count(withoutPet, 'users')).toBe(3);
    expect(count(withoutPet, 'students')).toBe(1);
    expect(count(withoutPet, 'classes')).toBe(1);
    expect(count(withoutPet, 'pets')).toBe(1);
    expect(count(withoutPet, 'records')).toBe(1);
  });

  it('still deletes the account when the missing domain is disabled but has no rows for it', async () => {
    // The complement of the case above: participation is only required when a row actually
    // references the account. `pets` has no row for this teacher's students, so the same deletion
    // succeeds - which is what makes disabling a feature plugin a supported deployment rather than a
    // broken one.
    withoutPet.kernel.db.prepare(`DELETE FROM pets`).run();
    const response = await api(withoutPet, 'DELETE', '/api/admin/users/2', token);
    expect(response.status).toBe(200);
    expect(count(withoutPet, 'users')).toBe(1);
  });
});
