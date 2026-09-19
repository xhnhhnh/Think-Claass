/**
 * G13 - the boot schema must satisfy every declaration made about it.
 *
 * This guard exists because a real regression got through the whole suite undetected.
 * Moving the DDL out of `initDb()` into a migration silently dropped six tables
 * (`classes`, `students`, `records`, `bank_accounts`, `stocks`, `student_stocks`),
 * because P4.3b had moved those definitions into a helper that `initDb()` called and
 * they were never in the boot DDL. Every test stayed green: the test helper still called
 * the same helper directly, so the kernel path was never exercised against the real boot
 * route.
 *
 * Two failure shapes it pins, both silent rather than loud:
 *
 *   1. a table a plugin manifest declares (`data.adopted` / `data.reads`) that the schema
 *      does not create -> that plugin fails at request time, in production only;
 *   2. a column that `api/db.ts` adds with `addColumnIfNotExists` but the CREATE omits ->
 *      the kernel composition, which never runs those ALTERs, answers "feature disabled"
 *      for every class instead of erroring, because the capability fallback reads
 *      `classes.<feature>` by name.
 *
 * A third shape was added in P4.3b.5c, after it had already shipped: a table that
 * `prisma/schema.prisma` declares but the migrations never create. `payment_orders` and
 * `payment_transactions` were in exactly that state, so every `/api/payment` route answered
 * 500 on any database built from these migrations, and `prisma db push` was the only thing
 * that could ever have created them. The check is now symmetric: every manifest
 * declaration AND every Prisma model must have a table.
 *
 * The schema is executed against an in-memory database, so this checks the SQL that
 * actually runs rather than the text of the file.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_MIGRATIONS, bootSchemaMigration } from '../../api/schema/appMigrations.js';
import { ROOT } from './lib/paths.mjs';
// Relative path on purpose: this project deliberately declares no `@thinkclass/*` aliases
// (see vitest.guardrails.config.ts), and the point of these two guards is to execute the
// REAL migration runner rather than a re-implementation of it.
import { runMigrations } from '../../packages/kernel/src/storage/migrations.js';

/**
 * Every migration that contributes to the application schema, in id order.
 *
 * Imported from `api/schema/appMigrations.ts` rather than listed here: this file used to
 * keep its own copy of the list, which is how the guard and the two compositions could have
 * disagreed about what "the schema" is. `paymentTablesMigration` and the two `0000c`/`0000d`
 * compatibility migrations are separate from the boot schema because a string migration's
 * checksum is its SQL text, so editing the boot schema would make `runMigrations` refuse to
 * start against every database that had already applied it.
 */
const APPLICATION_MIGRATIONS = APP_MIGRATIONS;

/**
 * All application tables, built by running the migrations for real.
 *
 * Through `runMigrations` and not `db.exec(migration.up)` (which is what this used to do):
 * a function migration has no SQL text to exec, and `runMigrations` is also what applies the
 * ledger, the ordering and the checksum verification in production.
 */
function createSchema(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, APPLICATION_MIGRATIONS, {});
  return db;
}

function tableNames(db: Database.Database): Set<string> {
  return new Set(
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((row) => (row as { name: string }).name),
  );
}

/** Columns whose absence is a silent wrong answer rather than an error. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  // The capability fallback reads these by name.
  classes: [
    'enable_chat_bubble',
    'enable_peer_review',
    'enable_tree_hole',
    'enable_shop',
    'enable_lucky_draw',
    'enable_challenge',
    'enable_family_tasks',
    'enable_world_boss',
    'enable_guild_pk',
    'enable_auction_blind_box',
    'enable_achievements',
    'enable_parent_buff',
    'enable_task_tree',
    'enable_danmaku',
    'enable_class_brawl',
    'enable_slg',
    'enable_gacha',
    'enable_economy',
    'enable_dungeon',
    'pet_selection_mode',
    'settings',
    'invite_code',
  ],
  // collaboration groups team-quest progress by group_id; insights reads the other two.
  students: ['group_id', 'last_checkin_date', 'birthday', 'available_points', 'total_points'],
  // engagement's praise handler writes mood; pointsService touches last_fed_at.
  pets: ['mood', 'last_fed_at', 'custom_image', 'attack_power'],
  peer_reviews: ['team_quest_id'],
  world_bosses: ['status'],
  messages: ['sender_role'],
  shop_items: ['is_active', 'teacher_id'],
  users: ['is_activated'],
  // Written by the parent-login path - now `plugins/identity` through the
  // `parent_buff.public.touchParentLogin` port, before that `api/modules/auth/auth.service.ts` in an
  // `ON CONFLICT` upsert - and read by name by the pet domain's parent-buff check. The boot
  // schema's CREATE omits it; it arrives through `0000c_legacy_compat_columns`. Its absence in
  // the kernel composition was measured, not theorised - see that migration's header.
  parent_activity: ['last_active_date'],
};

describe('G13 boot schema satisfies its declarations', () => {
  it('is a string migration, so its checksum survives relocation', () => {
    // A function migration checksums its own source text; moving the file would make the
    // runner refuse to start against an already-migrated database.
    expect(typeof bootSchemaMigration.up).toBe('string');
    expect(bootSchemaMigration.id).toBe('0000_legacy_boot_schema');
  });

  it('does not edit an already-applied migration', () => {
    // The boot schema's SQL is frozen: its checksum IS that text, and the runner throws
    // "was modified after it was applied" rather than re-running it. New tables therefore
    // arrive as new, later-sorting migrations - which is what `paymentTablesMigration` is.
    // This pins the id ORDER (not the text, which legitimately has no reason to change):
    // anything that must run after the boot schema has to sort after `0000_`.
    for (const migration of APPLICATION_MIGRATIONS.slice(1)) {
      expect(
        migration.id > bootSchemaMigration.id,
        `${migration.id} must sort after ${bootSchemaMigration.id} so users/classes exist first`,
      ).toBe(true);
    }
  });

  it('creates a table for every Prisma model', () => {
    // The inverse of the manifest check below, and the one that was missing. A model the
    // generated client can query but no migration creates is a 500 on every route that
    // touches it - and because `prisma db push` can paper over it locally, the failure is
    // invisible until a fresh deployment. `payment_orders` and `payment_transactions` sat
    // in exactly that hole.
    const db = createSchema();
    const tables = tableNames(db);

    const schemaText = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    const models = [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
    expect(models.length, 'prisma schema parsed to zero models - the regex has drifted').toBeGreaterThan(50);

    const missing = models
      .filter((model) => !tables.has(model))
      .map((model) => `prisma model "${model}" has no table in the application migrations`);

    expect(missing, missing.join('\n')).toEqual([]);
    db.close();
  });

  it('creates every table the plugin manifests declare', () => {
    const db = createSchema();
    const tables = tableNames(db);

    const missing: string[] = [];
    const pluginsDir = path.join(ROOT, 'plugins');
    for (const slug of fs.readdirSync(pluginsDir)) {
      const manifestPath = path.join(pluginsDir, slug, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        data?: { adopted?: string[]; reads?: string[] };
      };

      // A plugin may only create `p_<slug>_` tables itself; everything it adopts or reads
      // has to exist already, because `data.reads` grants no creation right.
      const declared = [...(manifest.data?.adopted ?? []), ...(manifest.data?.reads ?? [])];
      for (const table of declared) {
        if (!tables.has(table)) missing.push(`${slug}: data declares "${table}" but the schema does not create it`);
      }
    }

    expect(missing, missing.join('\n')).toEqual([]);
    db.close();
  });

  it('creates every column the feature gates and compatibility layer need', () => {
    const db = createSchema();

    const missing: string[] = [];
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      const present = new Set(
        db.prepare(`PRAGMA table_info(${table})`).all().map((row) => (row as { name: string }).name),
      );
      for (const column of columns) {
        if (!present.has(column)) missing.push(`${table}.${column} is read by name but is not created`);
      }
    }

    expect(missing, missing.join('\n')).toEqual([]);
    db.close();
  });

  it('keeps the schema in one place', () => {
    // The duplicate definition is what made drift possible; if a second schema module
    // reappears, this notices.
    const duplicate = ['api/schema/adoptedTables.ts'].filter((rel) => fs.existsSync(path.join(ROOT, rel)));
    expect(duplicate, `schema modules that should no longer exist: ${duplicate.join(', ')}`).toEqual([]);
  });

  /**
   * The direction G13 never checked: columns SQLite has that `prisma/schema.prisma` does not model.
   *
   * G13 asks "does every Prisma model have a table?" - one direction. Nothing asked the reverse, and
   * the two definitions have drifted twice. A column that exists in SQLite but not in Prisma is
   * invisible to the Prisma client (`SELECT *` will not surface it and `create` cannot set it), while
   * raw SQL through `ctx.db` reads and writes it happily - so the two data paths disagree about what
   * a row is.
   *
   * Measured with `.tmp/schema-prisma-column-drift.mjs`, which parses both definitions. The set is
   * pinned exactly rather than ratcheted: a new entry means someone added a column to the boot DDL
   * (or a compatibility migration) without updating the Prisma model, and the failure names it.
   *
   *   * `peer_reviews.team_quest_id` - added by `0000c_legacy_compat_columns`, written by the
   *     collaboration plugin and read by name. Legitimate, and the reason this list is allowed to be
   *     non-empty at all.
   *   * `blind_boxes.teacher_id` - `REFERENCES users(id)` in the boot DDL, absent from the Prisma
   *     model, and **never written by anything**: `plugins/marketplace` inserts only
   *     `(name, description, price, is_active)`. It is the one foreign key to `users` that the admin
   *     delete cascade does not clean (`.tmp/admin-cascade-fk-coverage.mjs`), and it is safe today
   *     only because every row has NULL there. Adding the delete to the cascade would be a no-op;
   *     dropping the column is the honest fix, and it is a schema migration, so it belongs to P7.
   */
  it('has no columns SQLite owns that the Prisma models do not', () => {
    const prismaSchema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    const bootSchema = fs.readFileSync(path.join(ROOT, 'api', 'schema', 'legacyBootSchema.ts'), 'utf8');

    const models = new Map<string, Set<string>>();
    for (const match of prismaSchema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
      const columns = new Set<string>();
      for (const line of (match[2] ?? '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
        const column = /^(\w+)\s+\w/.exec(trimmed);
        if (column) columns.add(column[1]);
      }
      models.set(match[1], columns);
    }

    const KNOWN = ['blind_boxes.teacher_id', 'peer_reviews.team_quest_id'];
    const drift: string[] = [];
    for (const match of bootSchema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n {4}\);/g)) {
      const table = match[1];
      const columns = models.get(table);
      if (!columns) continue;
      for (const line of (match[2] ?? '').split('\n')) {
        const column = /^\s*(\w+)\s+(INTEGER|TEXT|REAL|BLOB|NUMERIC|DATETIME|DATE|BOOLEAN|VARCHAR)/i.exec(line);
        if (!column) continue;
        if (!columns.has(column[1]) && !KNOWN.includes(`${table}.${column[1]}`)) {
          drift.push(`${table}.${column[1]}`);
        }
      }
    }

    expect(
      drift,
      `Columns exist in the boot schema but not in prisma/schema.prisma - the Prisma client cannot see them, so the two data paths disagree about the row:\n  ${drift.join('\n  ')}`,
    ).toEqual([]);
  });
});
