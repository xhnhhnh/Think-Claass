/**
 * The admin delete cascade, against a real database - its first such test.
 *
 * `DELETE /api/admin/users/:id` is the largest single operation in the codebase: it removes one
 * teacher plus their classes, students and everything those students own, which the inventory in
 * `.tmp/admin-cascade-inventory.mjs` measures at **58 tables in 65 statements**. Until this file,
 * every test that touched it mocked Prisma (`admin.module.test.ts`) or mocked the repository, so
 * nothing had ever executed the cascade against a schema - no foreign key, no NOT NULL and no
 * ordering constraint had been exercised.
 *
 * That matters more than usual here for two reasons:
 *
 *  1. **It is the one write path that bypasses the ownership model.** It goes through Prisma's
 *     `$transaction`, not `DbApi`, so it can - and does - delete from every other domain's tables
 *     by hard-coded name. HANDOFF section 8.3.1 has carried this debt since P4.3b precisely because
 *     it is invisible to guardrails: G1/G2 check imports, G10 checks declarations, and neither can
 *     see a `tx.<table>.deleteMany`.
 *  2. **It is atomic, and that is the constraint on fixing it.** The whole 65-statement cascade is
 *     one `prisma.$transaction`, so it either removes everything or nothing. Replacing those deletes
 *     with plugin port calls would make each one its own transaction and give that property up - a
 *     half-deleted account would then be a real state. This test pins the atomicity so that a future
 *     rewrite has to notice what it is trading away.
 *
 * ## Why this test runs on a real file, and how it stays out of the developer's database
 *
 * `api/prismaClient.ts` reads `DATABASE_FILE` at module load and hands that path to Prisma as an
 * explicit datasource (P4.3b.9), so setting `DATABASE_FILE` to a temp file points **both** data
 * paths at the temp file. That is only true because of P4.3b.9: before it, Prisma ignored the
 * variable and this test would have deleted rows from `<root>/database.sqlite`.
 *
 * The import of the repository is therefore *dynamic*, after the environment is set - the static
 * `import` at the top of a test file is hoisted, which would construct the client against the real
 * database before the first line of `beforeAll` ran.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openDatabase, runMigrations, type Database } from '@thinkclass/kernel';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

let directory = '';
let db: Database;

/** Loaded after `DATABASE_FILE` points at the temp copy; see the header. */
let repository: { deleteTeacher(id: number, actor: { id: number; role: string }, ip: string): Promise<Record<string, unknown>> };

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-admin-cascade-'));
  const file = path.join(directory, 'cascade.sqlite');

  // Order matters and is the whole trick: set the variable, create the file with the real schema,
  // and only then let `api/prismaClient.ts` be evaluated.
  process.env.DATABASE_FILE = file;
  db = openDatabase(file, { wal: false });
  runMigrations(db, APP_MIGRATIONS);
  db.close();

  const imported = await import('../../api/modules/admin/admin.repository.js');
  repository = new imported.PrismaAdminRepository();
});

afterAll(() => {
  delete process.env.DATABASE_FILE;
  if (!directory) return;
  // Prisma keeps a connection open for the life of the process, and on Windows an open handle
  // makes the directory undeletable - which is why the first version of this file failed its
  // teardown with EPERM and reported it as a test failure. A leftover temp directory is better
  // than a red suite for a cleanup detail, so the removal is best-effort.
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // ignored on purpose; the OS reclaims its temp directory
  }
});

/** Open the same file for assertions. */
function reader(): Database {
  return openDatabase(path.join(directory, 'cascade.sqlite'), { wal: false });
}

/**
 * Seed one teacher with everything the cascade is supposed to reach.
 *
 * Deliberately spread across domains that now belong to plugins (`pets`, `records`, `praises`,
 * `assignments`, `attendance_records`, `certificates`) and one that belongs to the kernel
 * (`operation_logs`), because the point of the test is the *cross-domain* reach. Seeded with raw
 * SQL rather than Prisma so the fixture does not depend on the code under test.
 */
function seed(): void {
  const seedDb = reader();
  seedDb.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES
      (1, 'superadmin', 'root', 'x', 1),
      (2, 'teacher', 'teacher2', 'x', 1),
      (3, 'student', 'student3', 'x', 1),
      (98, 'superadmin', 'root2', 'x', 1);

    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (10, '一班', 2, 'AAA111');
    INSERT INTO students (id, user_id, class_id, name) VALUES (20, 3, 10, '小明');
    INSERT INTO pets (id, student_id, element_type, level, experience, attack_power) VALUES (30, 20, 'fire', 3, 200, 20);
    INSERT INTO records (id, student_id, type, amount, description) VALUES (40, 20, 'ADD_POINTS', 5, 'seed');
    INSERT INTO praises (id, teacher_id, student_id, content) VALUES (50, 2, 20, '不错');
    INSERT INTO certificates (id, student_id, title) VALUES (60, 20, '进步之星');
    INSERT INTO attendance_records (id, class_id, student_id, status, date) VALUES (70, 10, 20, 'present', '2026-01-01');
    INSERT INTO assignments (id, class_id, teacher_id, title) VALUES (80, 10, 2, '作业一');
    INSERT INTO student_assignments (id, assignment_id, student_id, status) VALUES (90, 80, 20, 'pending');
    INSERT INTO operation_logs (id, teacher_id, action) VALUES (100, 2, 'SEED');
  `);
  seedDb.close();
}

function count(table: string): number {
  const readDb = reader();
  const row = readDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  readDb.close();
  return row.n;
}

function classRow(): { id: number } | undefined {
  const readDb = reader();
  const row = readDb.prepare('SELECT id FROM classes WHERE id = 10').get() as { id: number } | undefined;
  readDb.close();
  return row;
}

beforeAll(() => {
  seed();
});

describe('deleteTeacher', () => {
  it('collects the ids it needs with SELECT * FROM a table with a text PRIMARY KEY', () => {
    // `api_keys` has `key TEXT PRIMARY KEY` and the cascade's helper reads ids from it. Not part of
    // the delete path, but the repository touches it on other admin routes; this guards the fixture
    // against a schema drift that would make the next assertion pass for the wrong reason.
    expect(count('users')).toBe(4);
  });

  it('refuses an id that is not a teacher, with the legacy 404', async () => {
    await expect(repository.deleteTeacher(1, { id: 1, role: 'superadmin' }, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 404,
      message: '教师不存在',
    });
    // Nothing was removed by the refused call.
    expect(count('users')).toBe(4);
  });

  it('removes the teacher, their classes, their students and everything those students own', async () => {
    const result = await repository.deleteTeacher(2, { id: 1, role: 'superadmin' }, '127.0.0.1');

    expect(result).toMatchObject({ deletedTeacherId: 2, deletedClasses: 1, deletedStudents: 1, deletedStudentUsers: 1 });
    expect(String(result.message)).toContain('teacher2');

    // The three rows that identify the account went away...
    expect(count('users')).toBe(2); // superadmins 1 and 98 survive
    expect(classRow()).toBeUndefined();
    expect(count('students')).toBe(0);

    // ...and so did the rows six other domains own, which is the cross-domain reach this test
    // exists to pin. Each of these tables belongs to a plugin that cannot see this delete.
    expect(count('pets')).toBe(0);
    expect(count('records')).toBe(0);
    expect(count('praises')).toBe(0);
    expect(count('certificates')).toBe(0);
    expect(count('attendance_records')).toBe(0);
    expect(count('assignments')).toBe(0);
    expect(count('student_assignments')).toBe(0);
    // The audit table is reached too - and this is the one table where "deleted" is not the whole
    // story: the seeded row goes, and the cascade writes its *own* audit row in the same
    // transaction. Asserting 0 here was the first version of this test, and it was wrong for an
    // instructive reason: the delete and the record of the delete are one unit.
    expect(count('operation_logs')).toBe(1);
  });

  it('leaves the preserved superadmins alone', async () => {
    // `restoreSuperadmins` (used by the database reset) preserves every superadmin; an ordinary
    // teacher delete must not touch any of them.
    expect(count('users')).toBe(2);
    const readDb = reader();
    const roles = readDb.prepare('SELECT role FROM users ORDER BY id').all() as Array<{ role: string }>;
    readDb.close();
    expect(roles.map((row) => row.role)).toEqual(['superadmin', 'superadmin']);
  });

  it('writes one audit row describing what it deleted', async () => {
    const readDb = reader();
    const rows = readDb
      .prepare(
        `SELECT user_id, role, action, details, ip_address FROM operation_logs WHERE action = 'ADMIN_DELETE_TEACHER'`,
      )
      .all() as Array<{ user_id: number; role: string; action: string; details: string; ip_address: string }>;
    readDb.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: 1, role: 'superadmin', ip_address: '127.0.0.1' });
    // `details` is the JSON summary the admin console shows; it counts what was removed.
    expect(JSON.parse(rows[0].details)).toMatchObject({ teacherId: 2, deletedClasses: 1, deletedStudents: 1 });
  });

  it('reports the missing teacher again on a second call, having changed nothing', async () => {
    await expect(repository.deleteTeacher(2, { id: 1, role: 'superadmin' }, '127.0.0.1')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(count('users')).toBe(2);
  });
});
