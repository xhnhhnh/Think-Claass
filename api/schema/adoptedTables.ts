/**
 * Schema for tables that plugins *adopt* rather than create.
 *
 * ## Why this file exists
 *
 * A plugin may only create tables under its own `p_<slug>_` prefix (enforced by
 * `migrationRunner` and guardrail G7). But P4.3b migrates domains whose tables
 * already exist under legacy names, and whose **column names are the HTTP contract** -
 * `SELECT *` rows are returned straight through to the frontend, which reads
 * `deposit_amount`, `interest_rate`, `average_buy_price` and parses `trend_history` as
 * JSON. Renaming those tables is a coordinated frontend change, not a rename.
 *
 * So the host owns creating them and the plugin declares them under `data.adopted`,
 * which is exactly what that declaration means: "this plugin owns a table that still
 * carries its legacy name".
 *
 * ## Why the DDL is here and not in api/db.ts
 *
 * The migration runs in two directions at once - the legacy composition still boots
 * `initDb()`, while the kernel composition exists to prove plugins need no legacy
 * code. If the adopted tables were only created inside `initDb()`, a plugin would
 * activate fine in the kernel composition and then fail on its first request. This
 * module is the single source, and both paths call it, so there is no second copy to
 * drift.
 *
 * The statements are byte-compatible with the ones in `api/db.ts` (`CREATE TABLE IF
 * NOT EXISTS`, same columns, same `UNIQUE(student_id, stock_id)`, same index), so
 * running both is a no-op. When `api/db.ts`'s boot DDL becomes numbered migrations in
 * P4.3c this module is where those migrations get their table definitions from, or is
 * deleted outright - see docs/migration/HANDOFF.md §9.
 */

import type { Database } from '@thinkclass/kernel';

/** Tables a plugin declares under `data.adopted`, by owning plugin slug. */
export const ADOPTED_TABLE_NAMES = {
  classroom: ['students', 'classes', 'records'],
  economy: ['bank_accounts', 'stocks', 'student_stocks'],
} as const;

/**
 * Create every adopted table if it does not already exist.
 *
 * Idempotent by construction, so calling it twice - or alongside a database that
 * `initDb()` already prepared - is a no-op.
 *
 * This is the authoritative definition for these six tables. `api/db.ts` calls it and
 * no longer defines them itself, because two copies would drift and the drift would be
 * silent: the capability fallback below reads `classes.enable_*` by column name, so a
 * table created without those columns answers "feature disabled" for every class
 * instead of failing loudly.
 */
export function ensureAdoptedSchema(db: Database): void {
  db.exec(`
    -- classroom: students and classes.
    --
    -- classes.teacher_id and students.user_id referenced users(id) in the original
    -- boot DDL. That reference is dropped here on purpose: "users" belongs to the
    -- legacy auth module, which this module must not depend on - a plugin host that
    -- had to create the user table would know about identity. SQLite does not enforce
    -- a foreign key whose target table is absent, and when api/db.ts runs it creates
    -- "users" anyway, so the real schema is unchanged.
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE,
      teacher_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settings TEXT,
      -- The 19 legacy class feature flags. P4.1 replaced them with capability
      -- assignments, but a class that was never configured still resolves through
      -- these columns, which is what classroom.public.assert*FeatureEnabled falls back
      -- to. Dropping them is P7 work and must follow a data migration.
      enable_chat_bubble INTEGER DEFAULT 0,
      enable_peer_review INTEGER DEFAULT 0,
      enable_tree_hole INTEGER DEFAULT 0,
      enable_shop INTEGER DEFAULT 0,
      enable_lucky_draw INTEGER DEFAULT 0,
      enable_challenge INTEGER DEFAULT 0,
      enable_family_tasks INTEGER DEFAULT 0,
      enable_world_boss INTEGER DEFAULT 0,
      enable_guild_pk INTEGER DEFAULT 0,
      enable_auction_blind_box INTEGER DEFAULT 0,
      enable_achievements INTEGER DEFAULT 0,
      enable_parent_buff INTEGER DEFAULT 0,
      pet_selection_mode TEXT DEFAULT 'student'
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      class_id INTEGER,
      name TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      available_points INTEGER DEFAULT 0
    );

    -- classroom: the shared point ledger.
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_records_student_id ON records(student_id);

    -- economy: bank accounts and the classroom stock market.
    CREATE TABLE IF NOT EXISTS bank_accounts (
      student_id INTEGER PRIMARY KEY REFERENCES students(id),
      deposit_amount INTEGER DEFAULT 0,
      interest_rate REAL DEFAULT 0.05,
      last_interest_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      current_price INTEGER NOT NULL,
      trend_history TEXT,
      volatility REAL DEFAULT 0.1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      stock_id INTEGER REFERENCES stocks(id),
      shares INTEGER DEFAULT 0,
      average_buy_price REAL DEFAULT 0,
      UNIQUE(student_id, stock_id)
    );
  `);
}
