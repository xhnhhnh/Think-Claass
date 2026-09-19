/**
 * The compatibility columns, as a migration.
 *
 * ## What this fixes, measured rather than suspected
 *
 * `initDb()` used to guarantee 53 columns the `CREATE TABLE` statements do not all
 * declare - 50 through `addColumnIfNotExists(...)` and 3 through a raw
 * `ALTER TABLE shop_items ADD COLUMN ...` in a try/catch. Those statements only ever ran
 * in the legacy composition, because `initDb()` is called from `createLegacyApp()`. The
 * kernel composition runs the migrations and nothing else.
 *
 * So the two compositions had different schemas. `.tmp/schema-gap-probe.mts` booted a
 * real `createKernel()` with the application migrations and checked every column those
 * statements assume:
 *
 *   MISSING COLUMNS (1):
 *     - parent_activity.last_active_date  [api/db.ts:303]
 *
 * The other 52 were already in the boot schema (or, for `operation_logs.user_id` /
 * `.role`, in the kernel's own `0005_kernel_operation_logs` migration); this one was not.
 * It is read by name by the pet domain's parent-buff check and written by
 * `api/modules/auth/auth.service.ts`, so the kernel composition would have answered
 * "no parent buff" forever, or 500 on the parent login path - silently, because a missing
 * column in a *fallback* read is not an error, it is the wrong answer.
 *
 * ## Why it cannot simply be deleted from `api/db.ts`
 *
 * These statements are not redundant leftovers: they are the upgrade path for databases
 * created by an older version. `CREATE TABLE IF NOT EXISTS` does nothing to a table that
 * already exists, so an old database only ever gained these columns from the ALTERs.
 * Deleting them would strand every existing database; moving them into a migration keeps
 * upgrade-in-place working in *both* compositions, which is the whole point.
 *
 * ## Why `up` is a function, and why the list is inside it
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so a plain SQL migration would fail with
 * "duplicate column name" on every database that had already been through the legacy
 * ALTERs. A function migration can check `PRAGMA table_info` first.
 *
 * The column list is a literal *inside* the function body on purpose. A function
 * migration's checksum is `up.toString()` (`packages/kernel/src/storage/migrations.ts`),
 * which means a module-level list would let the schema change without the checksum
 * changing - every already-migrated database would then silently keep the old shape, and
 * the runner's "was modified after it was applied" protection would never fire. Keeping
 * the list inside `up` is what makes the checksum meaningful.
 *
 * The consequence, and it is deliberate: **this function must never be edited after it has
 * been applied anywhere.** New columns belong in a new migration. `auditLogsMigration` in
 * the kernel carries the same constraint for the same reason.
 */

import type { Database, Migration } from '@thinkclass/kernel';

export const LEGACY_COMPAT_COLUMNS_MIGRATION_ID = '0000c_legacy_compat_columns';

/**
 * Add a column only when the table exists and the column does not.
 *
 * The table-exists check is a deliberate hard failure rather than a skip: every table in
 * this list is created by the boot schema, so a missing one means the database is not the
 * schema this migration was written against, and continuing would produce the very silent
 * wrong answer this migration exists to prevent.
 */
function addColumnIfMissing(db: Database, table: string, column: string, definition: string): void {
  const exists = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
  if (!exists) {
    throw new Error(`cannot add ${table}.${column}: table "${table}" does not exist`);
  }

  const columns = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
  if (columns.includes(column)) return;

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export const legacyCompatColumnsMigration: Migration = {
  id: LEGACY_COMPAT_COLUMNS_MIGRATION_ID,
  owner: 'legacy',
  up: (db) => {
    const columns: Array<[table: string, column: string, definition: string]> = [
      // Attributed audit rows. The kernel's 0005 migration adds these too when it finds an
      // existing `operation_logs`; repeating them here is what makes the two paths agree.
      ['operation_logs', 'user_id', 'INTEGER REFERENCES users(id)'],
      ['operation_logs', 'role', 'TEXT'],

      ['articles', 'summary', 'TEXT'],
      ['articles', 'cover_image', 'TEXT'],
      ['articles', 'category', 'TEXT'],
      ['articles', 'is_published', 'INTEGER DEFAULT 0'],
      ['articles', 'view_count', 'INTEGER DEFAULT 0'],
      ['articles', 'created_at', 'DATETIME'],
      ['articles', 'updated_at', 'DATETIME'],

      ['students', 'birthday', 'TEXT'],

      // The 19 legacy class feature flags. The capability system reads these by name as its
      // fallback, so their absence is a silently disabled feature, not an error.
      ['classes', 'enable_chat_bubble', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_peer_review', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_tree_hole', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_shop', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_lucky_draw', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_challenge', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_family_tasks', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_world_boss', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_task_tree', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_danmaku', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_class_brawl', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_slg', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_gacha', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_economy', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_dungeon', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_guild_pk', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_auction_blind_box', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_achievements', 'INTEGER DEFAULT 0'],
      ['classes', 'enable_parent_buff', 'INTEGER DEFAULT 0'],

      ['world_bosses', 'status', "TEXT DEFAULT 'active'"],

      ['classes', 'settings', 'TEXT'],
      ['classes', 'pet_selection_mode', "TEXT DEFAULT 'student'"],
      ['classes', 'invite_code', 'TEXT'],

      // `parent_activity`: the column the probe found missing. Written by the parent-login
      // path, read by the pet domain's parent-buff check.
      ['parent_activity', 'last_active_date', 'TEXT'],

      ['pets', 'image_stage1', 'TEXT'],
      ['pets', 'image_stage2', 'TEXT'],
      ['pets', 'image_stage3', 'TEXT'],
      ['pets', 'image_stage4', 'TEXT'],
      ['pets', 'image_stage5', 'TEXT'],
      ['pets', 'image_stage6', 'TEXT'],
      ['pets', 'mood', "TEXT DEFAULT 'happy'"],
      ['pets', 'custom_image', 'TEXT'],
      ['pets', 'last_fed_at', 'DATETIME'],

      ['students', 'group_id', 'INTEGER REFERENCES student_groups(id)'],
      ['students', 'last_checkin_date', 'TEXT'],

      ['peer_reviews', 'team_quest_id', 'INTEGER REFERENCES team_quests(id)'],

      ['shop_items', 'is_active', 'INTEGER DEFAULT 1'],
      ['shop_items', 'teacher_id', 'INTEGER REFERENCES users(id)'],
      // These three used to be a raw `ALTER TABLE` trio whose "duplicate column" errors were
      // swallowed by an empty catch. Same effect, without a catch that hides real failures.
      ['shop_items', 'is_holiday_limited', 'INTEGER DEFAULT 0'],
      ['shop_items', 'holiday_start_time', 'TEXT'],
      ['shop_items', 'holiday_end_time', 'TEXT'],

      ['messages', 'sender_role', "TEXT DEFAULT 'student'"],
      ['users', 'is_activated', 'INTEGER DEFAULT 0'],
    ];

    for (const [table, column, definition] of columns) {
      addColumnIfMissing(db, table, column, definition);
    }
  },
  // No `down`: SQLite cannot drop a column in place, and a rebuild of 15 tables to undo a
  // compatibility shim is not worth the risk. The rollback path is "restore the database".
};
