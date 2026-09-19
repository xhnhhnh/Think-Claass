/**
 * The account-deletion scope classroom publishes (P4.3b.14).
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes and their students. The admin
 * console owns none of those tables, so it asks `classroom.public` for the *scope* - which classes
 * the teacher owns, and which `(student row, login row)` pairs live in them - and then hands each id
 * set to the domain that owns the table.
 *
 * Both methods are ids only, which is the whole point: a row-shaped answer would be a second
 * projection of `classes`/`students` for one caller's convenience, and the console is deliberately
 * not a second reader of classroom's storage shape.
 *
 * Two properties get specific attention because they are the ones a rewrite loses:
 *
 *   1. **An empty `classIds` answers `[]`.** It asks for nothing; if it fell through to SQL it would
 *      be either a syntax error (`IN ()`) or - worse - a query that means "every student", which on
 *      a deletion path is a whole-database wipe.
 *   2. **A student with `user_id IS NULL` is still returned**, with `userId: null`. Their roster row
 *      exists before their login does, and the deletion still has to remove it; dropping them would
 *      leave an orphan `students` row referencing a deleted teacher's class.
 *
 * The database is the real thing - the migration chain, `students`/`classes` as production has them,
 * through the ownership-checked `DbApi` - because both methods are SQL: the empty-list branch and the
 * `IN (...)` parameter list are exactly what a mock could not check.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createClassFeatureResolver } from '../../plugins/classroom/src/classroom.features.js';
import { createClassroomPort } from '../../plugins/classroom/src/classroom.port.js';
import { createClassroomRepository } from '../../plugins/classroom/src/classroom.repository.js';
import { createReportQueries } from '../../plugins/classroom/src/classroom.reports.js';
import { createNameCipher } from '../../plugins/classroom/src/classroom.support.js';

/** Mirrors `plugins/classroom/plugin.json`: owned tables (reads are not exercised by these two). */
const OWNED = ['students', 'classes', 'records'];

let kernel: Kernel;
let api: DbApi;
let port: ClassroomPort;

/** An identity cipher: these methods never touch student names. */
const identityCipher = { decrypt: (value: string) => value, encrypt: (value: string) => value };

beforeEach(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent' },
    migrations: APP_MIGRATIONS,
  });

  api = createDbApi({
    db: kernel.db,
    pluginId: 'classroom',
    ownedTables: new Set(OWNED),
    readTables: new Set(),
    strict: true,
  });

  /**
   * The port's dependencies outside the repository: the ownership-checked handle (`ctx.db`), the
   * feature resolver's `ctx.permissions`, and the port's event bus for
   * `classroom.student.points.changed`. Neither of the last two is reached by the two
   * account-deletion reads, so they are minimal stubs.
   */
  const ctx = {
    db: api,
    permissions: { assignedTo: () => undefined },
    events: { emit: () => undefined },
  } as never;

  const repository = createClassroomRepository(ctx);
  port = createClassroomPort({
    ctx,
    repository,
    features: createClassFeatureResolver(ctx, repository),
    cipher: identityCipher as ReturnType<typeof createNameCipher>,
    reports: createReportQueries(api),
  });

  kernel.db.exec(`
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES
      (1, '一班', 7, 'AAA111'),
      (2, '二班', 7, 'BBB222'),
      (3, '三班', 9, 'CCC333'),
      (4, '无主班', NULL, 'DDD444');

    INSERT INTO students (id, user_id, class_id, name, total_points) VALUES
      (10, 21, 1, '小明', 0),
      (11, NULL, 1, '无账号的学生', 0),
      (12, 22, 2, '小红', 0),
      (13, 23, 3, '小刚', 0);
  `);
});

afterEach(async () => {
  await kernel.shutdown();
});

describe('listClassIdsByTeacher', () => {
  it('returns the teacher own classes as ids, in id order', async () => {
    expect(await port.listClassIdsByTeacher(7)).toEqual([1, 2]);
    expect(await port.listClassIdsByTeacher(9)).toEqual([3]);
  });

  it('answers [] for a teacher with no classes and for an unknown id', async () => {
    expect(await port.listClassIdsByTeacher(8)).toEqual([]);
    expect(await port.listClassIdsByTeacher(999)).toEqual([]);
  });

  it('does not claim an unowned class, whose teacher_id is NULL', async () => {
    // Class 4 has no teacher; no id claim must ever include it, or the console would delete a class
    // nobody asked it to.
    expect(await port.listClassIdsByTeacher(7)).not.toContain(4);
    expect(await port.listClassIdsByTeacher(9)).not.toContain(4);
  });
});

describe('listStudentAccountsByClassIds', () => {
  it('returns the (student, login) pairs of the classes, in student id order', async () => {
    expect(await port.listStudentAccountsByClassIds([1, 2])).toEqual([
      { studentId: 10, userId: 21 },
      { studentId: 11, userId: null },
      { studentId: 12, userId: 22 },
    ]);
  });

  it('keeps a student whose user_id IS NULL rather than filtering the row out', async () => {
    // Student 11 has no login yet; its roster row still has to be deleted, so it must be visible.
    const pairs = await port.listStudentAccountsByClassIds([1]);
    expect(pairs).toEqual([
      { studentId: 10, userId: 21 },
      { studentId: 11, userId: null },
    ]);
  });

  it('answers [] for an empty id list, and never widens it into every student', async () => {
    // The assertion that matters: three students exist, and the answer is still nothing.
    expect(await port.listStudentAccountsByClassIds([])).toEqual([]);
  });

  it('answers [] for classes with no students and for unknown class ids', async () => {
    kernel.db.prepare(`INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (5, '空班', 7, 'EEE555')`).run();

    expect(await port.listStudentAccountsByClassIds([5])).toEqual([]);
    expect(await port.listStudentAccountsByClassIds([999])).toEqual([]);
  });
});

describe('the deletion scope as the console consumes it', () => {
  it('resolves a teacher to their classes and the accounts inside them, in two port calls', async () => {
    const classIds = await port.listClassIdsByTeacher(7);
    const accounts = await port.listStudentAccountsByClassIds(classIds);

    expect(classIds).toEqual([1, 2]);
    expect(accounts).toEqual([
      { studentId: 10, userId: 21 },
      { studentId: 11, userId: null },
      { studentId: 12, userId: 22 },
    ]);
    // Student 13 belongs to teacher 9's class and must not leak into teacher 7's scope.
    expect(accounts.map((account) => account.studentId)).not.toContain(13);
  });

  it('answers an empty scope for a teacher with no classes', async () => {
    const classIds = await port.listClassIdsByTeacher(8);
    expect(await port.listStudentAccountsByClassIds(classIds)).toEqual([]);
  });
});
