/**
 * The homework plugin's schema, registered as an application migration.
 *
 * ## Why the SQL lives in the plugin and the registration lives here
 *
 * The DDL is in `plugins/homework/migrations/0001_init.sql` because those are that plugin's
 * tables and the plugin's directory is where its schema belongs. It is *declared* here rather
 * than under the manifest's `provides.migrations` for two structural reasons:
 *
 *   1. Guardrail G13 builds the application schema from `APP_MIGRATIONS` and then asserts that
 *      every Prisma model has a table. DDL that only the plugin runtime applied would not exist
 *      in that database, so the model check would fail - the same shape of gap that once let
 *      `payment_orders` exist in Prisma and nowhere else.
 *   2. Migrations are content-addressed: `runMigrations` refuses to start when a migration's SQL
 *      changed after it was applied. Registering one file under two ids (`0001_homework_tables`
 *      for the app, `p_homework_0001_init` for the plugin) would bind them to stay
 *      byte-identical forever, which is a rule the next person cannot see.
 *
 * The runner's own table-ownership check is what keeps this honest in the other direction: this
 * migration may only touch `p_homework_*`, and it does. It is also written with
 * `CREATE TABLE IF NOT EXISTS`, so a database that already has the tables - one built by an
 * earlier boot, or by a deployment that ran the plugin's copy - is unaffected.
 *
 * ## Ordering
 *
 * The id sorts after every `0000*` migration, which is required: `p_homework_questions`,
 * `p_homework_submissions` and `p_homework_qa_messages` carry foreign keys into
 * `p_homework_assignments`, and the whole file must be applied in one transaction so the
 * references resolve.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Migration } from '@thinkclass/kernel';

export const HOMEWORK_TABLES_MIGRATION_ID = '0001_homework_tables';

/**
 * The SQL is read from the plugin's own migration file rather than inlined here.
 *
 * Read at module load, not at apply time, because the checksum is the SQL text: a value that
 * changed between two reads would make the runner's tamper check fire against itself.
 *
 * The path is resolved with `import.meta.url` rather than `process.cwd()`. `api/db.ts` and
 * `api/app.ts` are imported by tests that run from the repository root and by a `tsx` server
 * started from anywhere, and a cwd-relative path would make the migration's *content* - and
 * therefore its checksum - depend on where the process was started.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(HERE, '..', '..', 'plugins', 'homework', 'migrations', '0001_init.sql');

export const homeworkTablesMigration: Migration = {
  id: HOMEWORK_TABLES_MIGRATION_ID,
  owner: 'homework',
  up: fs.readFileSync(SQL_PATH, 'utf8'),
  down: `
    DROP TABLE IF EXISTS p_homework_qa_messages;
    DROP TABLE IF EXISTS p_homework_photos;
    DROP TABLE IF EXISTS p_homework_answers;
    DROP TABLE IF EXISTS p_homework_submissions;
    DROP TABLE IF EXISTS p_homework_questions;
    DROP TABLE IF EXISTS p_homework_assignments;
  `,
};
