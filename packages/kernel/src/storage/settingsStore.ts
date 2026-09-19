/**
 * Kernel settings store.
 *
 * `settings` is a kernel-owned key/value table (see the plan's data ownership
 * split): plugin settings are namespaced `plugin.<slug>.<key>`, so a plugin cannot
 * collide with another plugin's keys or with a kernel setting.
 *
 * The table is created by a kernel migration rather than by the legacy boot DDL, so
 * a kernel-only boot has everything it needs. It matches the baseline schema
 * (`key TEXT PRIMARY KEY, value TEXT`) so existing rows keep working.
 */

import type { Migration } from './migrations.js';
import type { Database } from './connection.js';

export const SETTINGS_MIGRATION_ID = '0001_kernel_settings';

export const settingsMigration: Migration = {
  id: SETTINGS_MIGRATION_ID,
  owner: 'kernel',
  up: `
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `,
  down: `DROP TABLE IF EXISTS settings;`,
};

export interface SettingsStore {
  get(key: string): string | undefined;
  set(key: string, value: string | null): void;
  /** All settings as a plain object; the shape `/api/settings` returns. */
  all(): Record<string, string>;
  /** Settings whose key starts with `prefix`. */
  withPrefix(prefix: string): Record<string, string>;
  remove(key: string): boolean;
}

export function createSettingsStore(db: Database): SettingsStore {
  return {
    get(key) {
      const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
        | { value: string | null }
        | undefined;
      return row?.value ?? undefined;
    },

    set(key, value) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, value);
    },

    all() {
      const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string | null }>;
      return rows.reduce<Record<string, string>>((accumulator, row) => {
        accumulator[row.key] = row.value ?? '';
        return accumulator;
      }, {});
    },

    withPrefix(prefix) {
      const rows = db
        .prepare(`SELECT key, value FROM settings WHERE key LIKE ? ESCAPE '\\'`)
        .all(`${prefix.replace(/[%_\\]/g, '\\$&')}%`) as Array<{ key: string; value: string | null }>;
      return rows.reduce<Record<string, string>>((accumulator, row) => {
        accumulator[row.key] = row.value ?? '';
        return accumulator;
      }, {});
    },

    remove(key) {
      return db.prepare(`DELETE FROM settings WHERE key = ?`).run(key).changes > 0;
    },
  };
}
