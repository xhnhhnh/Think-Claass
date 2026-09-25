/**
 * G17 - schema changes live only in migrations.
 *
 * ## The bug class this exists for
 *
 * `api/db.ts` used to define the schema twice: once through the migration list, and once
 * through ~120 lines of its own DDL (`addColumnIfNotExists(...)`, a raw `ALTER TABLE` trio,
 * and 20 `CREATE INDEX` statements). Only the migration list ran in the kernel composition,
 * because that composition never calls `initDb()`.
 *
 * The divergence was measured, not guessed (`.tmp/schema-gap-probe.mts`, a real
 * `createKernel()` boot against every statement in that section):
 *
 *   MISSING COLUMNS (1):  parent_activity.last_active_date
 *   MISSING INDEXES (19): idx_parent_activity_parent_student (UNIQUE), idx_classes_invite_code
 *                         (UNIQUE), and 17 query indexes
 *
 * Both unique ones are integrity constraints: without them
 * `INSERT ... ON CONFLICT(parent_id, student_id)` is rejected outright by SQLite, and two
 * classes can share an invite code. None of it errored - a missing column in a *fallback*
 * read is the wrong answer, not an exception, which is why the existing guards (G13 checks
 * tables and a hand-written column list; G8 checks endpoints) could not see it.
 *
 * ## What is asserted
 *
 *   1. `api/db.ts` adds no columns and creates no indexes. The compatibility columns and
 *      indexes are migrations now (`0000c` / `0000d`), which is what makes them apply in both
 *      compositions *and* keeps upgrade-in-place working for databases created by an older
 *      version.
 *   2. The only DDL left in `api/db.ts` is the enumerated `messages` rebuild. It is listed
 *      here explicitly rather than tolerated: adding any DDL fails this guard, and finishing
 *      that rebuild (P4.3c.3) means lowering this allowance - the same ratchet discipline as
 *      `tests/guardrails/lib/allowances.json`.
 *   3. The compatibility column list stays *inside* the function migration that is
 *      checksummed. A function migration's checksum is `up.toString()`; a module-level list
 *      would let the schema change without the checksum changing, and every already-migrated
 *      database would silently keep the old shape.
 *   4. Both compositions import the one migration list instead of building their own.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import Database from 'better-sqlite3';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { legacyCompatColumnsMigration } from '../../api/schema/legacyCompatColumns.js';
import { legacyCompatIndexesMigration } from '../../api/schema/legacyCompatIndexes.js';
import { runMigrations } from '../../packages/kernel/src/storage/migrations.js';
import { ROOT } from './lib/paths.mjs';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Remove line and block comments, so prose about DDL is not mistaken for DDL. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const DDL_RE =
  /\b(?:CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+[A-Za-z_][A-Za-z0-9_]*|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[A-Za-z_][A-Za-z0-9_]*|DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+[A-Za-z_][A-Za-z0-9_]*|ALTER\s+TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+(?:ADD\s+COLUMN\s+[A-Za-z_][A-Za-z0-9_]*|RENAME\s+TO\s+[A-Za-z_][A-Za-z0-9_]*))/gi;

/** DDL `api/db.ts` is still allowed to contain, enumerated and nothing else. */
const ALLOWED_DDL_IN_DB_TS = [
  'CREATE TABLE IF NOT EXISTS messages_new',
  'DROP TABLE messages',
  'ALTER TABLE messages_new RENAME TO messages',
];

/**
 * The indexes the compatibility migration must create, enumerated.
 *
 * Derived from the migration's own text it would be self-confirming: deleting a statement
 * would shrink the expectation too. The count is pinned as well, so an addition has to be a
 * deliberate edit here.
 */
const REQUIRED_COMPAT_INDEXES = [
  'idx_parent_activity_parent_student',
  'idx_classes_invite_code',
  'idx_students_class_id',
  'idx_students_user_id',
  'idx_classes_teacher_id',
  'idx_pets_student_id',
  'idx_shop_items_teacher_id',
  'idx_redemption_tickets_student_id',
  'idx_assignments_class_id',
  'idx_exams_class_id',
  'idx_attendance_records_class_id',
  'idx_attendance_records_student_id',
  'idx_messages_class_id',
  'idx_messages_receiver_id',
  'idx_activation_events_user_id',
  'idx_activation_events_order_id',
  'idx_territories_class_id',
  'idx_student_pets_student_id',
  'idx_dungeon_runs_student_id',
];

/** The two that are integrity constraints, not performance: `ON CONFLICT` and uniqueness. */
const UNIQUE_COMPAT_INDEXES = ['idx_parent_activity_parent_student', 'idx_classes_invite_code'];

describe('G17 schema changes live only in migrations', () => {
  it('api/db.ts adds no columns and creates no indexes', () => {
    const source = stripComments(read('api/db.ts'));

    // The helper itself must not come back: if it exists, the next column added to it is
    // invisible to the kernel composition again.
    expect(source.includes('addColumnIfNotExists')).toBe(false);
    expect(/ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN/i.test(source)).toBe(false);
    expect(/CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(source)).toBe(false);
  });

  it('api/db.ts contains only the enumerated remaining DDL', () => {
    const found = [...stripComments(read('api/db.ts')).matchAll(DDL_RE)].map((match) =>
      match[0].replace(/\s+/g, ' ').trim(),
    );

    // Asserting the exact set (not "at most") also fails when the rebuild is finished and
    // this allowance is not lowered, which is the point of a ratchet.
    expect([...found].sort()).toEqual([...ALLOWED_DDL_IN_DB_TS].sort());
  });

  it('keeps the compatibility column list inside the checksummed function', () => {
    const source = legacyCompatColumnsMigration.up.toString();
    expect(typeof legacyCompatColumnsMigration.up, 'a conditional ADD COLUMN cannot be plain SQL').toBe('function');

    // Every column must be a literal in the function body: `up.toString()` is the checksum.
    //
    // The pattern is quote- and space-tolerant because `up.toString()` returns the
    // *transformed* source (tsx/esbuild rewrites `['a', 'b']` to `["a","b"]`), not the text
    // in the file. That transform is also why the checksum is stable in this project - the
    // server runs through `tsx` unbundled - and why bundling or minifying the server would
    // make every function migration fail its checksum comparison.
    const entries = [...source.matchAll(/\[\s*["']([a-z_]+)["']\s*,\s*["']([a-z_0-9]+)["']\s*,/g)];
    expect(entries.length, 'the column list moved out of `up`, so it is no longer checksummed').toBeGreaterThanOrEqual(53);

    // Spot checks on both ends of the list: the column the probe found missing, and one of
    // the feature flags whose absence produces a silently disabled feature.
    expect(entries.map((entry) => `${entry[1]}.${entry[2]}`)).toContain('parent_activity.last_active_date');
    expect(entries.map((entry) => `${entry[1]}.${entry[2]}`)).toContain('classes.enable_economy');
  });

  it('keeps the index migration a string migration', () => {
    // `IF NOT EXISTS` makes the whole statement list idempotent, so this one needs no logic
    // and can keep the checksum form that survives relocation.
    expect(typeof legacyCompatIndexesMigration.up).toBe('string');
    expect(legacyCompatIndexesMigration.id).toBe('0000d_legacy_compat_indexes');
  });

  it('creates every compatibility index, with the two unique ones still unique', () => {
    const db = new Database(':memory:');
    runMigrations(db, APP_MIGRATIONS, {});

    const indexes = new Map(
      (db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index'`).all() as Array<{ name: string; sql: string }>).map(
        (row) => [row.name, row.sql],
      ),
    );

    const missing = REQUIRED_COMPAT_INDEXES.filter((name) => !indexes.has(name));
    expect(missing, `compatibility indexes not created by the migrations: ${missing.join(', ')}`).toEqual([]);

    // A `UNIQUE` that quietly became a plain index would keep the query fast and lose the
    // constraint - the failure mode `ON CONFLICT(parent_id, student_id)` reports as a 500.
    for (const name of UNIQUE_COMPAT_INDEXES) {
      expect(indexes.get(name)?.toUpperCase(), `${name} must stay UNIQUE`).toContain('CREATE UNIQUE INDEX');
    }

    // Pinned so that dropping a statement from the migration cannot pass unnoticed.
    const created = [...indexes.keys()].filter((name) => REQUIRED_COMPAT_INDEXES.includes(name));
    expect(created).toHaveLength(REQUIRED_COMPAT_INDEXES.length);

    db.close();
  });

  it('applies one shared migration list in both compositions', () => {
    // Three hand-copied lists (api/db.ts, api/app.ts, the G13 guard) is how the two
    // compositions came to disagree about the schema in the first place.
    expect(read('api/db.ts')).toContain('runMigrations(db, APP_MIGRATIONS');
    expect(read('api/app.ts')).toContain('migrations: APP_MIGRATIONS');

    const ids = APP_MIGRATIONS.map((migration) => migration.id);
    // `0001_homework_tables` is the homework plugin's six tables. Its DDL lives in that plugin's own
    // directory and is registered here rather than through the manifest's `provides.migrations`,
    // because G13 builds its schema from this list and then asserts every Prisma model has a table -
    // see the header of `api/schema/homeworkTables.ts`.
    //
    // `0000h_ai_study_feature_column` is the one column the AI 智学 feature switch needs
    // (`classes.enable_ai_study`). It is a *new* migration rather than an addition to
    // `0000c_legacy_compat_columns`, because a function migration's checksum is `up.toString()` and
    // editing it after it has been applied anywhere makes `runMigrations` refuse to start. The
    // `0000h` prefix sorts after `0000g_incentive_namespace` and before `0001_`, so the boot schema
    // still runs first - which is what the sort assertion below is for.
    expect(ids).toEqual(['0000_legacy_boot_schema', '0000b_payment_tables', '0000c_legacy_compat_columns', '0000d_legacy_compat_indexes', '0000e_incentive_policy', '0000f_incentive_event_receipt', '0000g_incentive_namespace', '0000h_ai_study_feature_column', '0001_homework_tables']);
    // Ordering is by id, so the boot schema must sort first for the FKs to resolve.
    expect([...ids].sort()).toEqual(ids);
  });
});
