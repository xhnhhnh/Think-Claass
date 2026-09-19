/**
 * SQLite connection.
 *
 * `api/db.ts` currently owns the connection *and* 1,152 lines of DDL and query
 * helpers. The kernel keeps only the connection and its pragmas; all schema changes
 * move into the versioned migration runner, and all queries move into plugins.
 */

import fs from 'node:fs';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import type { Logger } from '../logging/logger.js';

export type Database = BetterSqlite3.Database;

export interface OpenDatabaseOptions {
  /** Create parent directories if missing. */
  ensureDir?: boolean;
  /** Skip WAL (used for in-memory test databases). */
  wal?: boolean;
  logger?: Logger;
}

/**
 * Open the database and apply the pragmas the application depends on.
 *
 * `foreign_keys` is enabled explicitly: the codebase toggles it off during ad-hoc
 * table rebuilds (`api/db.ts:1250-1265`), and enforcement must not depend on the
 * ambient default.
 */
export function openDatabase(file: string, options: OpenDatabaseOptions = {}): Database {
  const isMemory = file === ':memory:';

  if (!isMemory && options.ensureDir !== false) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new BetterSqlite3(file);

  if (options.wal !== false && !isMemory) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  options.logger?.debug('database opened', { file: isMemory ? ':memory:' : file });
  return db;
}

/** Column names present on a table; empty when the table does not exist. */
export function tableColumns(db: Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

export function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

/**
 * Quote an identifier for interpolation into SQL.
 *
 * Needed because `PRAGMA table_info(?)` does not accept bound parameters. Anything
 * reaching this function must already have been validated against a strict
 * identifier pattern; the throw is the backstop, not the validation.
 */
export function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`unsafe SQL identifier: ${JSON.stringify(identifier)}`);
  }
  return `"${identifier}"`;
}

/**
 * Add a column when it is absent.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so a conditional change like this cannot
 * be expressed as a SQL migration - it is the reason `Migration.up` may be a
 * function. Returns true when the column was added.
 */
export function addColumnIfMissing(db: Database, table: string, column: string, definition: string): boolean {
  if (tableColumns(db, table).includes(column)) return false;
  db.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`);
  return true;
}

/** Wrap `fn` in a transaction. Nested calls join the outer transaction. */
export function transaction<T>(db: Database, fn: () => T): T {
  return db.transaction(fn)();
}
