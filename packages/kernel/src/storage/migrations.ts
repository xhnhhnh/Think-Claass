/**
 * Versioned migration runner.
 *
 * The baseline system applied DDL on every boot: `CREATE TABLE IF NOT EXISTS`
 * plus an `addColumnIfMissing` helper plus ad-hoc `ALTER TABLE`, with no ledger
 * recording what had run (`api/db.ts`). That makes a failed upgrade
 * indistinguishable from a fresh install and leaves orphans behind, such as the
 * `messages_new` table that exists in raw SQL but in no Prisma model.
 *
 * This runner records every applied migration with a checksum so drift is
 * detectable, and it enforces table ownership so one plugin cannot alter another
 * plugin's - or the kernel's - tables.
 */

import crypto from 'node:crypto';

import type { Logger } from '../logging/logger.js';
import { type Database } from './connection.js';

export interface Migration {
  /** Stable, ordered id, e.g. `0001_kernel_core`. */
  id: string;
  /** SQL to apply. */
  up: string;
  /** Optional SQL to undo. Not all migrations are reversible. */
  down?: string;
  /** Owning plugin id, or `kernel`. Drives table-ownership enforcement. */
  owner: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  durationMs: number;
}

export interface RunMigrationsOptions {
  /** When true, report what would run without touching the database. */
  dryRun?: boolean;
  logger?: Logger;
}

export interface AppliedMigration {
  id: string;
  owner: string;
  checksum: string;
  applied_at: string;
}

const LEDGER = '__core_migrations';

function checksum(sql: string): string {
  return crypto.createHash('sha256').update(sql).digest('hex').slice(0, 32);
}

/**
 * Tables a SQL migration creates, alters or drops, with the operation that
 * touched them. Used for ownership enforcement and reporting.
 *
 * The `(?!IF\b|EXISTS\b|NOT\b)` guard matters: for a non-literal name such as
 * `CREATE TABLE ${LEDGER}`, the capture cannot match, and without the guard the
 * engine backtracks past the `IF NOT EXISTS` group and reports a table named "IF".
 */
export function extractTableOperations(sql: string): Array<{ operation: string; table: string }> {
  const out: Array<{ operation: string; table: string }> = [];
  const patterns: Array<[string, RegExp]> = [
    ['create', /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?!IF\b|EXISTS\b|NOT\b)[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi],
    ['alter', /ALTER\s+TABLE\s+(?!IF\b|EXISTS\b|NOT\b)[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi],
    ['drop', /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?!IF\b|EXISTS\b|NOT\b)[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi],
    [
      'index',
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?[A-Za-z_][A-Za-z0-9_]*[`"\]]?\s+ON\s+[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi,
    ],
  ];
  for (const [operation, re] of patterns) {
    for (const m of sql.matchAll(re)) out.push({ operation, table: m[1] });
  }
  return out;
}

/** Table namespace a plugin owns. `acme.quiz` -> `p_acme_quiz_`. */
export function pluginTablePrefix(slug: string): string {
  return `p_${slug}_`;
}

export interface OwnershipViolation {
  table: string;
  operation: string;
  reason: string;
}

/**
 * Verify a migration only touches tables its owner is allowed to touch.
 *
 * `kernel` may touch kernel tables; a plugin may touch only `p_<slug>_*`. Anything
 * else is a violation - this is what stops a plugin from quietly altering a core
 * table to suit itself.
 */
export function checkTableOwnership(
  migration: Migration,
  allowedTables: ReadonlySet<string>,
  options: { pluginPrefix?: string } = {},
): OwnershipViolation[] {
  const violations: OwnershipViolation[] = [];
  for (const { operation, table } of extractTableOperations(migration.up)) {
    if (allowedTables.has(table)) continue;
    if (options.pluginPrefix && table.startsWith(options.pluginPrefix)) continue;
    violations.push({
      table,
      operation,
      reason:
        options.pluginPrefix === undefined
          ? `owner "${migration.owner}" may only touch kernel-owned tables`
          : `owner "${migration.owner}" may only touch tables prefixed "${options.pluginPrefix}"`,
    });
  }
  return violations;
}

function ensureLedger(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${LEDGER} (
      id          TEXT PRIMARY KEY,
      owner       TEXT NOT NULL DEFAULT 'kernel',
      checksum    TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    );
  `);
}

export function listApplied(db: Database): AppliedMigration[] {
  ensureLedger(db);
  return db.prepare(`SELECT id, owner, checksum, applied_at FROM ${LEDGER} ORDER BY id`).all() as AppliedMigration[];
}

/**
 * Apply pending migrations in id order.
 *
 * Each migration runs inside its own transaction together with its ledger row, so
 * a failure leaves the database at the previous migration rather than half-applied.
 */
export function runMigrations(db: Database, migrations: Migration[], options: RunMigrationsOptions = {}): MigrationResult {
  const logger = options.logger;
  const started = Date.now();
  ensureLedger(db);

  const alreadyApplied = new Map(listApplied(db).map((row) => [row.id, row]));
  const ordered = [...migrations].sort((a, b) => a.id.localeCompare(b.id));

  // Detect tampering: a migration whose SQL changed after being applied would make
  // the recorded schema a lie.
  for (const migration of ordered) {
    const previous = alreadyApplied.get(migration.id);
    if (previous && previous.checksum !== checksum(migration.up)) {
      throw new Error(
        `migration "${migration.id}" was modified after it was applied ` +
          `(recorded ${previous.checksum}, now ${checksum(migration.up)}). ` +
          `Add a new migration instead of editing an applied one.`,
      );
    }
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of ordered) {
    if (alreadyApplied.has(migration.id)) {
      skipped.push(migration.id);
      continue;
    }
    if (options.dryRun) {
      applied.push(migration.id);
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.up);
      db.prepare(`INSERT INTO ${LEDGER} (id, owner, checksum, applied_at) VALUES (?, ?, ?, ?)`).run(
        migration.id,
        migration.owner,
        checksum(migration.up),
        new Date().toISOString(),
      );
    });

    try {
      apply();
      applied.push(migration.id);
      logger?.info('migration applied', { id: migration.id, owner: migration.owner });
    } catch (error) {
      logger?.error('migration failed', {
        id: migration.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `migration "${migration.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { applied, skipped, durationMs: Date.now() - started };
}

/** Undo an applied migration. Only possible when it declares `down`. */
export function rollbackMigration(db: Database, migration: Migration, options: RunMigrationsOptions = {}): boolean {
  const logger = options.logger;
  if (!migration.down) return false;
  ensureLedger(db);
  const exists = db.prepare(`SELECT id FROM ${LEDGER} WHERE id = ?`).get(migration.id);
  if (!exists) return false;

  db.transaction(() => {
    db.exec(migration.down as string);
    db.prepare(`DELETE FROM ${LEDGER} WHERE id = ?`).run(migration.id);
  })();
  logger?.info('migration rolled back', { id: migration.id });
  return true;
}
