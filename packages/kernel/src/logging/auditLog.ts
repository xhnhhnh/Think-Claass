/**
 * Audit log.
 *
 * The baseline produced audit entries from a middleware containing four hardcoded
 * path checks, and attributed every one of them to teacher id `1` because it read
 * `req.body.teacherId` with a literal fallback (`api/utils/logMiddleware.ts:44`,
 * "Here we mock it as 1"). Anything not on those four paths was silently not
 * audited at all, and no plugin or module could add an entry.
 *
 * Two pieces replace it:
 *
 *   - an **audit registry** of declarative descriptors: whoever owns a route says
 *     what it means, rather than a central if/else chain knowing every route;
 *   - an **audit sink** subscribing to `kernel.request.audit`, so any module or
 *     plugin can emit an audit entry through the event bus.
 *
 * Attribution comes from the verified request context, never from the request body.
 */

import type { HttpMethod } from '@thinkclass/contracts';

import type { Logger } from './logger.js';
import type { Database } from '../storage/connection.js';
import { addColumnIfMissing, quoteIdentifier, tableColumns, tableExists } from '../storage/connection.js';
import type { Migration } from '../storage/migrations.js';

export const AUDIT_LOGS_MIGRATION_ID = '0005_kernel_operation_logs';

/**
 * Minimal structural request/response shapes.
 *
 * Deliberately not express types: the middleware only needs these five fields, and
 * staying structural keeps the kernel free of a dependency on the HTTP framework and
 * makes the middleware trivial to unit test.
 */
export interface RequestLike {
  method?: string;
  baseUrl?: string;
  path?: string;
  body?: unknown;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export interface ResponseLike {
  statusCode: number;
  on(event: 'finish', listener: () => void): unknown;
  removeListener(event: 'finish', listener: () => void): unknown;
}

const OPERATION_LOGS_DDL = `
  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER,
    user_id INTEGER,
    role TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * `operation_logs` predates the plugin system and carries two defects worth fixing
 * here rather than living with:
 *
 *  1. it was created without `user_id` / `role` - the legacy boot DDL adds them
 *     separately and Prisma's model already has them, so a plain
 *     `CREATE TABLE IF NOT EXISTS` leaves an existing database short of two columns;
 *  2. both attribution columns carry `REFERENCES users(id)`. An audit entry for a
 *     user that does not exist - or that has since been deleted - is rejected by the
 *     foreign key, and the write is swallowed by the sink's error handler. Audit
 *     history is *supposed* to outlive the records it describes, so the constraints
 *     are wrong. SQLite cannot drop a constraint in place, so the table is rebuilt.
 *
 * The rebuild is safe inside the migration transaction because nothing references
 * `operation_logs`; only its own outgoing references are dropped.
 */
export const auditLogsMigration: Migration = {
  id: AUDIT_LOGS_MIGRATION_ID,
  owner: 'kernel',
  up: (db) => {
    const existed = tableExists(db, 'operation_logs');

    if (!existed) {
      db.exec(OPERATION_LOGS_DDL);
    } else {
      addColumnIfMissing(db, 'operation_logs', 'user_id', 'INTEGER');
      addColumnIfMissing(db, 'operation_logs', 'role', 'TEXT');
      dropForeignKeys(db, 'operation_logs');
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_operation_logs_teacher_id ON operation_logs(teacher_id);`);
  },
  down: `DROP TABLE IF EXISTS operation_logs;`,
};

/** Rebuild a table without its outgoing foreign keys, preserving every row. */
function dropForeignKeys(db: Database, table: string): void {
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all() as unknown[];
  if (foreignKeys.length === 0) return;

  const columns = tableColumns(db, table);
  const columnList = ['id', 'teacher_id', 'user_id', 'role', 'action', 'details', 'ip_address', 'created_at'].filter((c) =>
    columns.includes(c),
  );

  db.exec(`CREATE TABLE ${quoteIdentifier(`${table}__rebuilt`)} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER,
    user_id INTEGER,
    role TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  // Only copy columns present in the old shape, so a partially migrated legacy table
  // does not break the rebuild.
  const copyList = columnList.map((c) => quoteIdentifier(c)).join(', ');
  db.exec(
    `INSERT INTO ${quoteIdentifier(`${table}__rebuilt`)} (${copyList}) SELECT ${copyList} FROM ${quoteIdentifier(table)};`,
  );
  db.exec(`DROP TABLE ${quoteIdentifier(table)};`);
  db.exec(`ALTER TABLE ${quoteIdentifier(`${table}__rebuilt`)} RENAME TO ${quoteIdentifier(table)};`);
}

// ---------------------------------------------------------------------------
// descriptors
// ---------------------------------------------------------------------------

export interface AuditDescriptor {
  /** HTTP method, or `*` for any. */
  method: HttpMethod | '*';
  /** Express-style path, e.g. `/api/students/:id/points`. */
  pattern: string;
  /** Human-readable action recorded in the log. */
  action: string;
  /**
   * Detail template. `{{param}}` placeholders resolve from route params first, then
   * the request body, so a descriptor reads declaratively instead of running code.
   */
  detail?: string;
  /** Filled in by the registry: the module or plugin that declared it. */
  owner?: string;
}

export interface AuditMatch {
  descriptor: AuditDescriptor;
  params: Record<string, string>;
}

export interface AuditRegistry {
  register(descriptors: AuditDescriptor[], owner: string): void;
  unregister(owner: string): void;
  match(method: string, path: string): AuditMatch | null;
  list(): AuditDescriptor[];
}

/** Turn `/api/students/:id/points` into a matcher. */
function compilePattern(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const escaped = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${escaped}/?$`), keys };
}

export function createAuditRegistry(): AuditRegistry {
  /** @type {Array<{ descriptor: AuditDescriptor; regex: RegExp; keys: string[] }>} */
  const compiled: Array<{ descriptor: AuditDescriptor; regex: RegExp; keys: string[] }> = [];

  return {
    register(descriptors, owner) {
      for (const descriptor of descriptors) {
        const { regex, keys } = compilePattern(descriptor.pattern);
        compiled.push({ descriptor: { ...descriptor, owner }, regex, keys });
      }
    },

    unregister(owner) {
      for (let i = compiled.length - 1; i >= 0; i -= 1) {
        if (compiled[i].descriptor.owner === owner) compiled.splice(i, 1);
      }
    },

    match(method, path) {
      for (const entry of compiled) {
        if (entry.descriptor.method !== '*' && entry.descriptor.method !== method) continue;
        const result = entry.regex.exec(path);
        if (!result) continue;

        const params: Record<string, string> = {};
        entry.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(result[index + 1] ?? '');
        });
        return { descriptor: entry.descriptor, params };
      }
      return null;
    },

    list() {
      return compiled.map((entry) => entry.descriptor);
    },
  };
}

/**
 * Resolve `{{placeholders}}` from route params, then the request body.
 *
 * Supports one piece of syntax beyond substitution, `{{key?yes:no}}`, so a boolean
 * field can render as a word ("上架" / "下架") without the descriptor needing code.
 * Descriptors stay pure data, which is what lets them come from a plugin manifest
 * when runtime installation arrives.
 */
export function renderDetail(template: string, params: Record<string, string>, body: unknown): string {
  const source = (body ?? {}) as Record<string, unknown>;

  const read = (key: string): string => {
    if (key in params) return params[key];
    const value = source[key];
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return String(value.length);
    return String(value);
  };

  return template
    .replace(/\{\{\s*([\w.]+)\s*\?\s*([^:}]*?)\s*:\s*([^}]*?)\s*\}\}/g, (_match, key: string, whenTrue: string, whenFalse: string) => {
      const raw = key in params ? params[key] : source[key];
      const truthy = Array.isArray(raw) ? raw.length > 0 : Boolean(raw) && raw !== '0' && raw !== 'false';
      return truthy ? whenTrue : whenFalse;
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => read(key));
}

// ---------------------------------------------------------------------------
// sink
// ---------------------------------------------------------------------------

export interface AuditEntry {
  action: string;
  detail?: string | null;
  actorId?: number | null;
  /**
   * Value for the historical `teacher_id` column.
   *
   * Defaults to `actorId` (which is what the middleware has always written), but a caller may set
   * it explicitly - the admin console's own entries carry `user_id` and leave `teacher_id` null,
   * and `DELETE /api/admin/users/:id` writes its summary row through `ctx.audit` now instead of a
   * private `tx.operation_logs.create`. Passing `null` keeps that shape instead of silently
   * attributing the entry to the acting superadmin's teacher column too.
   */
  teacherId?: number | null;
  role?: string | null;
  ip?: string | null;
  requestId?: string | null;
  /** Module or plugin that produced the entry. */
  source?: string | null;
}

export interface AuditRow {
  id: number;
  teacher_id: number | null;
  user_id: number | null;
  role: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLog {
  record(entry: AuditEntry): void;
  list(limit?: number): AuditRow[];
  count(): number;
  /**
   * Delete the entries attributed to these users/teachers, returning how many rows went.
   *
   * Exists for account deletion: `DELETE /api/admin/users/:id` removed the deleted account's
   * audit rows inside the same transaction that removed the account, and the table is the
   * kernel's, so the operation has to be published rather than executed by the plugin.
   *
   * Call it inside the caller's transaction - it runs on the kernel's connection, which is the
   * same one `ctx.db` wraps, so a plugin that calls it inside `ctx.db.tx(...)` keeps the delete
   * and the record of the delete in one unit (which is how the pre-migration cascade behaved).
   *
   * A no-op returning 0 when both sets are empty; it never deletes the whole table.
   */
  purgeFor(ids: { teacherIds?: number[]; userIds?: number[] }): number;
}

export interface AuditLogOptions {
  db: Database;
  logger?: Logger;
}

export function createAuditLog(options: AuditLogOptions): AuditLog {
  const { db, logger } = options;

  return {
    record(entry) {
      try {
        db.prepare(
          `INSERT INTO operation_logs (teacher_id, user_id, role, action, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          entry.teacherId === undefined ? (entry.actorId ?? null) : entry.teacherId,
          entry.actorId ?? null,
          entry.role ?? null,
          entry.action,
          entry.detail ?? null,
          entry.ip ?? null,
        );
      } catch (error) {
        // Auditing must never break the request it is describing.
        logger?.warn('failed to write audit entry', {
          action: entry.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    list(limit = 100) {
      return db
        .prepare(`SELECT * FROM operation_logs ORDER BY id DESC LIMIT ?`)
        .all(limit) as AuditRow[];
    },

    count() {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM operation_logs`).get() as { n: number };
      return row.n;
    },

    purgeFor(ids) {
      const teacherIds = uniqueIds(ids.teacherIds);
      const userIds = uniqueIds(ids.userIds);
      if (teacherIds.length === 0 && userIds.length === 0) return 0;

      // Only the sets that were supplied become predicates: an empty `IN ()` is not valid SQL, and
      // "no teacher ids" must not silently turn into "every row".
      const clauses: string[] = [];
      const params: number[] = [];
      if (teacherIds.length > 0) {
        clauses.push(`teacher_id IN (${teacherIds.map(() => '?').join(', ')})`);
        params.push(...teacherIds);
      }
      if (userIds.length > 0) {
        clauses.push(`user_id IN (${userIds.map(() => '?').join(', ')})`);
        params.push(...userIds);
      }

      return db.prepare(`DELETE FROM operation_logs WHERE ${clauses.join(' OR ')}`).run(...params).changes;
    },
  };
}

/** Finite, deduplicated ids; anything else is dropped rather than bound. */
function uniqueIds(values: number[] | undefined): number[] {
  if (!values) return [];
  return [...new Set(values.filter((value) => typeof value === 'number' && Number.isFinite(value)))];
}

/** Build the express middleware that records an entry for a matched descriptor. */
export function createAuditMiddleware(options: {
  registry: AuditRegistry;
  auditLog: AuditLog;
  /** Injected so the middleware does not import the http layer. */
  getContext: (req: RequestLike) => { actorId: number | null; role: string | null; requestId?: string };
  pathOf?: (req: RequestLike) => string;
}) {
  const { registry, auditLog, getContext } = options;
  const pathOf = options.pathOf ?? ((req: RequestLike) => `${req.baseUrl ?? ''}${req.path ?? ''}`);

  return (req: RequestLike, res: ResponseLike, next: () => void): void => {
    if (req.method === 'GET') return next();

    const match = registry.match(req.method ?? '', pathOf(req));
    if (!match) return next();

    const onFinish = () => {
      res.removeListener('finish', onFinish);
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const context = getContext(req);
      const { descriptor, params } = match;
      auditLog.record({
        action: descriptor.action,
        detail: descriptor.detail ? renderDetail(descriptor.detail, params, req.body) : null,
        actorId: context.actorId,
        role: context.role,
        ip: req.ip ?? req.socket?.remoteAddress ?? null,
        requestId: context.requestId ?? null,
        source: descriptor.owner ?? null,
      });
    };

    // `finish` rather than wrapping res.json: it fires for every response path and
    // does not depend on which serialisation method the handler used.
    res.on('finish', onFinish);
    next();
  };
}
