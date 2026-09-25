/**
 * Parent-buff port tests: the write identity performs on parent login.
 *
 * `parent_buff.public.touchParentLogin` exists because `api/modules/auth/auth.service.ts` used to
 * upsert a `parent_activity` row on every parent login through Prisma, while `plugins/parent-buff`
 * owns that table and writes a different kind of row into it. Two writers of one table is what the
 * ownership model forbids, so the upsert moved to the owner (P4.3b.7) and identity calls the port.
 *
 * The existing `parent-buff-service.test.ts` covers the blessing; this file covers the port, and
 * specifically the thing a fake cannot show: **the upsert must not collide with the blessing rows**.
 * The blessing writes `(student_id, activity_type='PARENT_BUFF', points_awarded=0)` with a NULL
 * `parent_id`; the login writes `(parent_id, student_id, activity_type='login', last_active_date)`
 * and conflicts on the `(parent_id, student_id)` unique index. An upsert keyed on the student alone
 * would overwrite a blessing with a login, which is the failure this file is built to catch.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createParentBuffRepository } from '../../plugins/parent-buff/src/parentBuff.repository.js';
import { ParentBuffService } from '../../plugins/parent-buff/src/parentBuff.service.js';

/** Mirrors `plugins/parent-buff/plugin.json` -> `data.adopted`. */
const ADOPTED_TABLES = ['parent_activity'];

let kernel: Kernel;
let api: DbApi;
let service: ParentBuffService;

function rowsFor(studentId: number) {
  return kernel.db
    .prepare(
      `SELECT parent_id, student_id, activity_type, points_awarded, last_active_date, date(created_at) AS created_day
         FROM parent_activity WHERE student_id = ? ORDER BY id`,
    )
    .all(studentId) as Array<{
    parent_id: number | null;
    student_id: number;
    activity_type: string | null;
    points_awarded: number | null;
    last_active_date: string | null;
    created_day: string;
  }>;
}

beforeEach(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent' },
    migrations: APP_MIGRATIONS,
  });

  api = createDbApi({
    db: kernel.db,
    pluginId: 'parent-buff',
    ownedTables: new Set(ADOPTED_TABLES),
    readTables: new Set(),
    strict: true,
  });

  // The blessing's own guard is exercised in `parent-buff-service.test.ts`; this file drives the
  // port (the login upsert) and the daily limit through SQLite, so the classroom port the
  // authorization check needs is a stub that is never asked a question here.
  service = new ParentBuffService(createParentBuffRepository(api), {
    listStudentsByParent: async () => [],
  } as never);
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash) VALUES (5, 'parent', 'parent5', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (6, 'parent', 'parent6', 'x');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 1, 'AAA111');
    INSERT INTO students (id, class_id, name) VALUES (20, 1, '小明');
    INSERT INTO students (id, class_id, name) VALUES (21, 1, '小红');
  `);
});

afterEach(async () => {
  await kernel.shutdown();
});

// ---------------------------------------------------------------------------

describe('touchParentLogin', () => {
  it('inserts one row for the pair, carrying parent_id, the login type and the day', () => {
    service.touchParentLogin(5, 20, '2026-03-04');

    const rows = rowsFor(20);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      parent_id: 5,
      student_id: 20,
      activity_type: 'login',
      // The column's `DEFAULT 0` supplies this: the insert does not name it, exactly as the
      // pre-migration Prisma upsert did not.
      points_awarded: 0,
      last_active_date: '2026-03-04',
    });
    // `created_at` comes from the column default (CURRENT_TIMESTAMP), as it did through Prisma.
    expect(rows[0].created_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updates the same row on a second login instead of appending', () => {
    // The UNIQUE index `idx_parent_activity_parent_student` is what makes the upsert possible at
    // all - P4.3c.3a added it to the migration chain after measuring that kernel-only boots were
    // missing it, and without it this statement would be rejected by SQLite outright.
    service.touchParentLogin(5, 20, '2026-03-04');
    service.touchParentLogin(5, 20, '2026-03-05');

    const rows = rowsFor(20);
    expect(rows).toHaveLength(1);
    expect(rows[0].last_active_date).toBe('2026-03-05');
  });

  it('keeps a different parent, and a different student, as separate rows', () => {
    service.touchParentLogin(5, 20, '2026-03-04');
    service.touchParentLogin(6, 20, '2026-03-04');
    service.touchParentLogin(5, 21, '2026-03-04');

    expect(rowsFor(20).map((row) => row.parent_id)).toEqual([5, 6]);
    expect(rowsFor(21).map((row) => row.parent_id)).toEqual([5]);
  });

  it('does not disturb a blessing row for the same student', () => {
    // The collision the conflict target exists to avoid: the blessing has a NULL parent_id and
    // activity_type 'PARENT_BUFF', the login has both ids and 'login'. Both must coexist.
    service.createParentBuff({ studentId: 20 });
    service.touchParentLogin(5, 20, '2026-03-04');

    const rows = rowsFor(20);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.activity_type).sort()).toEqual(['PARENT_BUFF', 'login']);
    expect(rows.find((row) => row.activity_type === 'PARENT_BUFF')).toMatchObject({
      parent_id: null,
      points_awarded: 0,
      last_active_date: null,
    });
  });

  it('allows blessing after parent login and limits the blessing itself to once per Shanghai day', () => {
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
    service.touchParentLogin(5, 20, today);

    expect(() => service.createParentBuff({ studentId: 20 })).not.toThrow();
    expect(() => service.createParentBuff({ studentId: 20 })).toThrow(/今日已经施放过祝福了/);
    expect(rowsFor(20).map((row) => row.activity_type).sort()).toEqual(['PARENT_BUFF', 'login']);
  });
});
