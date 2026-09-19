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
 * The schema is executed against an in-memory database, so this checks the SQL that
 * actually runs rather than the text of the file.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootSchemaMigration } from '../../api/schema/legacyBootSchema.js';
import { ROOT } from './lib/paths.mjs';

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
};

describe('G13 boot schema satisfies its declarations', () => {
  it('is a string migration, so its checksum survives relocation', () => {
    // A function migration checksums its own source text; moving the file would make the
    // runner refuse to start against an already-migrated database.
    expect(typeof bootSchemaMigration.up).toBe('string');
    expect(bootSchemaMigration.id).toBe('0000_legacy_boot_schema');
  });

  it('creates every table the plugin manifests declare', () => {
    const db = new Database(':memory:');
    db.exec(bootSchemaMigration.up as string);
    const tables = new Set(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((row) => (row as { name: string }).name),
    );

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
    const db = new Database(':memory:');
    db.exec(bootSchemaMigration.up as string);

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
});
