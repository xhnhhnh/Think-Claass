/**
 * Namespaced, ownership-checked database access for plugins.
 *
 * A plugin gets a narrow API rather than the raw better-sqlite3 handle, and every
 * statement is checked against the plugin's declared table ownership. The check
 * runs only while `strict` is true (anything other than production) because parsing
 * SQL on every query in production is not worth the cost - but during development
 * it turns "plugin quietly wrote into a core table" from a silent corruption into a
 * loud failure at the call site.
 */

import type { DbApi, DbRunResult, SqlParam } from '@thinkclass/plugin-sdk';
import type { Database, Logger } from '@thinkclass/kernel';

/**
 * SQL keywords that may follow FROM / INTO / JOIN / UPDATE / TABLE without being a
 * table name.
 *
 * Neither a plain pattern nor a keyword list alone is enough, so the extractor does
 * both. `DO UPDATE SET col = ...` in an upsert looks exactly like `UPDATE <table>` to a
 * pattern matcher, which made every `INSERT ... ON CONFLICT DO UPDATE` fail the
 * ownership check with the message `plugin "x" may not write to table "SET"`.
 *
 * Found by portal's bulk homepage upsert - the first statement in this codebase to use
 * that form. Nothing in this list may ever be a legal table name.
 */
const NON_TABLE_KEYWORDS = new Set([
  'set', 'where', 'values', 'select', 'limit', 'order', 'group', 'by', 'having',
  'on', 'and', 'or', 'as', 'not', 'in', 'is', 'null', 'default', 'primary',
  'foreign', 'unique', 'check', 'constraint', 'references', 'collate', 'using',
  'if', 'exists', 'table', 'conflict', 'do', 'nothing', 'returning', 'with',
  'recursive', 'union', 'all', 'distinct', 'case', 'when', 'then', 'else', 'end',
  'inner', 'left', 'right', 'outer', 'cross', 'natural', 'index', 'view', 'trigger',
]);

/**
 * Candidate table references.
 *
 * Deliberately permissive - it captures whatever follows a table-introducing verb,
 * including `IF` after `CREATE TABLE`. Filtering happens in `extractTargets`, which is
 * more robust than encoding every exclusion into the pattern.
 */
const TARGET_RE =
  /\b(?:(?:FROM|INTO|JOIN|UPDATE)\s+|(?:CREATE|DROP|ALTER)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?)[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi;

/**
 * Tables referenced by a statement.
 *
 * Used by the ownership check, so a *false positive* breaks a legitimate query (as
 * `SET` did) and a *false negative* would let a plugin write outside its declaration.
 * The keyword filter is what makes the permissive pattern safe.
 */
export function extractTargets(sql: string): string[] {
  const found = new Set<string>();
  for (const match of sql.matchAll(TARGET_RE)) {
    const name = match[1];
    if (!NON_TABLE_KEYWORDS.has(name.toLowerCase())) found.add(name);
  }
  return [...found];
}

const WRITE_RE = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|WITH\s+RECURSIVE)/i;

export interface DbApiOptions {
  db: Database;
  pluginId: string;
  /** Tables the plugin owns; the only ones it may write to. */
  ownedTables: Set<string>;
  /** Tables owned elsewhere that the plugin declared it reads. */
  readTables: Set<string>;
  /** Enforce ownership. Off in production for performance. */
  strict: boolean;
  logger?: Logger;
}

export class TableOwnershipError extends Error {
  constructor(
    readonly pluginId: string,
    readonly table: string,
    message: string,
  ) {
    super(message);
    this.name = 'TableOwnershipError';
  }
}

/**
 * Tables a statement targets, for the ownership check.
 *
 * Kept under its original name so the public export and every call site stay stable.
 */
export function referencedTables(sql: string): string[] {
  return extractTargets(sql);
}

export function isWriteStatement(sql: string): boolean {
  return WRITE_RE.test(sql);
}

export function createDbApi(options: DbApiOptions): DbApi {
  const { db, pluginId, ownedTables, readTables, strict, logger } = options;

  function assertAllowed(sql: string): void {
    if (!strict) return;
    const write = isWriteStatement(sql);
    for (const table of referencedTables(sql)) {
      if (ownedTables.has(table)) continue;
      // SQLite internals are always readable.
      if (table.startsWith('sqlite_')) continue;

      if (write) {
        throw new TableOwnershipError(
          pluginId,
          table,
          `plugin "${pluginId}" may not write to table "${table}"; it does not own it. ` +
            `Declare it in manifest data.reads if you only need to read it.`,
        );
      }
      if (readTables.has(table)) continue;
      throw new TableOwnershipError(
        pluginId,
        table,
        `plugin "${pluginId}" reads table "${table}" without declaring it in manifest data.reads.`,
      );
    }
  }

  const api: DbApi = {
    query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
      assertAllowed(sql);
      return db.prepare(sql).all(...params) as T[];
    },

    get<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | undefined {
      assertAllowed(sql);
      return db.prepare(sql).get(...params) as T | undefined;
    },

    run(sql: string, params: SqlParam[] = []): DbRunResult {
      assertAllowed(sql);
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },

    tx<T>(fn: (tx: DbApi) => T): T {
      return db.transaction(() => fn(api))();
    },

    exec(sql: string): void {
      assertAllowed(sql);
      db.exec(sql);
      logger?.debug('plugin executed raw DDL/DML', { pluginId, tables: referencedTables(sql) });
    },
  };

  return api;
}
