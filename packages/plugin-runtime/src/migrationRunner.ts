/**
 * Plugin schema migrations.
 *
 * Plugins own their tables and apply their own DDL. Unlike the baseline - which
 * re-ran every `CREATE TABLE IF NOT EXISTS` on each boot with no record of what had
 * been applied (`api/db.ts`) - plugin migrations go through the kernel's versioned
 * runner with a checksum ledger, so a partially applied upgrade is detectable and
 * an edited migration is refused rather than silently diverging.
 *
 * Ownership is enforced before anything executes: a plugin may only touch tables
 * prefixed `p_<slug>_`. Without that check the "plugin owns its data" rule would be
 * a convention, and the first plugin to need a column on `classes` would quietly
 * add one.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { Migration, Database, Logger } from '@thinkclass/kernel';
import { checkTableOwnership, runMigrations } from '@thinkclass/kernel';
import { tablePrefixOf } from '@thinkclass/plugin-sdk';

import type { DiscoveredPlugin } from './discovery.js';

export interface PluginMigrationViolation {
  pluginId: string;
  migrationId: string;
  table: string;
  operation: string;
  reason: string;
}

export interface PluginMigrationOutcome {
  pluginId: string;
  applied: string[];
  skipped: string[];
  violations: PluginMigrationViolation[];
  /** Set when the migration could not even be read or executed. */
  error: string | null;
}

export interface RunPluginMigrationsOptions {
  db: Database;
  plugin: DiscoveredPlugin;
  logger?: Logger;
  /** Validate ownership but do not execute. */
  dryRun?: boolean;
}

/**
 * Load and apply a single plugin's declared migrations.
 *
 * Returns violations rather than throwing so the caller can decide: a plugin with
 * an ownership violation is rejected at boot with an actionable message, instead
 * of taking the process down.
 */
export function runPluginMigrations(options: RunPluginMigrationsOptions): PluginMigrationOutcome {
  const { db, plugin, logger, dryRun } = options;
  const pluginId = plugin.manifest.id;
  const declared = plugin.manifest.provides?.migrations ?? [];

  const outcome: PluginMigrationOutcome = {
    pluginId,
    applied: [],
    skipped: [],
    violations: [],
    error: null,
  };

  if (declared.length === 0) return outcome;

  const prefix = tablePrefixOf(plugin.manifest.slug);
  const coreTables = new Set<string>();
  const migrations: Migration[] = [];

  for (const declaration of declared) {
    const upPath = path.join(plugin.directory, declaration.up);
    if (!upPath.startsWith(plugin.directory)) {
      outcome.error = `migration "${declaration.id}" points outside the plugin directory`;
      return outcome;
    }

    let up: string;
    let down: string | undefined;
    try {
      up = fs.readFileSync(upPath, 'utf8');
      down = declaration.down ? fs.readFileSync(path.join(plugin.directory, declaration.down), 'utf8') : undefined;
    } catch (error) {
      outcome.error = `migration "${declaration.id}" could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return outcome;
    }

    // Namespaced so two plugins can both call a migration "0001_init".
    const id = `${prefix}${declaration.id}`;
    const migration: Migration = { id, owner: pluginId, up, ...(down ? { down } : {}) };

    const violations = checkTableOwnership(migration, coreTables, { pluginPrefix: prefix });
    if (violations.length > 0) {
      for (const violation of violations) {
        outcome.violations.push({
          pluginId,
          migrationId: declaration.id,
          table: violation.table,
          operation: violation.operation,
          reason: violation.reason,
        });
      }
      continue;
    }

    migrations.push(migration);
  }

  if (outcome.violations.length > 0) {
    logger?.error('plugin migration rejected', {
      pluginId,
      violations: outcome.violations.map((v) => `${v.operation} ${v.table}`),
    });
    return outcome;
  }

  try {
    const result = runMigrations(db, migrations, { logger, dryRun });
    outcome.applied = result.applied;
    outcome.skipped = result.skipped;
    logger?.debug('plugin migrations complete', {
      pluginId,
      applied: result.applied.length,
      skipped: result.skipped.length,
    });
  } catch (error) {
    outcome.error = error instanceof Error ? error.message : String(error);
    logger?.error('plugin migration failed', { pluginId, error: outcome.error });
  }

  return outcome;
}

/** Human-readable summary of every violation found across plugins. */
export function describeViolations(outcomes: PluginMigrationOutcome[]): string[] {
  return outcomes.flatMap((outcome) =>
    outcome.violations.map(
      (violation) =>
        `${violation.pluginId}: migration "${violation.migrationId}" ${violation.operation}s "${violation.table}" - ${violation.reason}`,
    ),
  );
}
