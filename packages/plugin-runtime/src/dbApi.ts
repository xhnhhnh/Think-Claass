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
 * Tables referenced by a statement.
 *
 * Single capture group with a keyword guard: `DROP TABLE x` must resolve to `x`,
 * and `CREATE TABLE IF NOT EXISTS ${x}` must resolve to nothing rather than to "IF".
 */
const TARGET_RE =
  /\b(?:(?:FROM|INTO|UPDATE|JOIN)\s+(?!IF\b|EXISTS\b|NOT\b|TABLE\b)|(?:CREATE|DROP|ALTER)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?!IF\b|EXISTS\b|NOT\b|TABLE\b))[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi;

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

/** Extract the tables a statement targets. */
export function referencedTables(sql: string): string[] {
  const found = new Set<string>();
  for (const match of sql.matchAll(TARGET_RE)) found.add(match[1]);
  return [...found];
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
