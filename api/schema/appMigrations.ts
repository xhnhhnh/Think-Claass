/**
 * The application's migration list - the single definition of the business schema.
 *
 * This list used to exist in three places that had to agree by hand:
 *
 *   * `api/db.ts`  -> `runMigrations(db, [bootSchema, paymentTablesMigration])`
 *   * `api/app.ts` -> `createKernel({ migrations: [bootSchemaMigration, paymentTablesMigration] })`
 *   * `tests/guardrails/boot-schema-completeness.test.ts` -> a third copy, which also
 *     applied each migration with `db.exec(migration.up)` and therefore could not have run
 *     a function migration at all.
 *
 * Two compositions reading one schema is the point of P4.3c, and a list that is copied by
 * hand is exactly how the two drift apart: add a table to one copy and the other
 * composition boots without it. Everything now imports `APP_MIGRATIONS`, and G17 pins that
 * `api/db.ts` no longer performs schema DDL of its own.
 *
 * ## Ordering
 *
 * `runMigrations` sorts by id, so the array order is documentation rather than control
 * flow. The ids are chosen so the sort is the order the schema must be built in:
 *
 *   0000_legacy_boot_schema     all 79 tables, frozen (its SQL text IS its checksum)
 *   0000b_payment_tables        two tables that only ever existed in Prisma
 *   0000c_legacy_compat_columns columns `CREATE TABLE` never declared
 *   0000d_legacy_compat_indexes indexes only the legacy composition used to create
 *   0001_kernel_settings ...    the kernel's own migrations
 */

import type { Migration } from '@thinkclass/kernel';

import { bootSchemaMigration, BOOT_SCHEMA_MIGRATION_ID } from './legacyBootSchema.js';
import { legacyCompatColumnsMigration, LEGACY_COMPAT_COLUMNS_MIGRATION_ID } from './legacyCompatColumns.js';
import { legacyCompatIndexesMigration, LEGACY_COMPAT_INDEXES_MIGRATION_ID } from './legacyCompatIndexes.js';
import { paymentTablesMigration, PAYMENT_TABLES_MIGRATION_ID } from './paymentTables.js';

export {
  BOOT_SCHEMA_MIGRATION_ID,
  LEGACY_COMPAT_COLUMNS_MIGRATION_ID,
  LEGACY_COMPAT_INDEXES_MIGRATION_ID,
  PAYMENT_TABLES_MIGRATION_ID,
  bootSchemaMigration,
  legacyCompatColumnsMigration,
  legacyCompatIndexesMigration,
  paymentTablesMigration,
};

export const APP_MIGRATIONS: Migration[] = [
  bootSchemaMigration,
  paymentTablesMigration,
  legacyCompatColumnsMigration,
  legacyCompatIndexesMigration,
];
