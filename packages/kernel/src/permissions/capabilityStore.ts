/**
 * Capability assignments.
 *
 * Replaces the 19 `enable_*` boolean columns on the `classes` table with a
 * scope-addressed table: a capability can be granted or denied at platform, school,
 * class or student scope, and adding a capability no longer requires an
 * `ALTER TABLE` on a core table.
 *
 * The table itself is kernel-owned; *which* capabilities exist is declared by
 * plugins. The kernel never names one.
 */

import type { CapabilityAssignment, PermissionKey, ScopeType } from '@thinkclass/contracts';

import type { Database } from '../storage/connection.js';
import type { Migration } from '../storage/migrations.js';
import type { AssignmentStore } from './permissionEngine.js';

export const CAPABILITY_ASSIGNMENTS_MIGRATION_ID = '0004_kernel_capability_assignments';

export const capabilityAssignmentsMigration: Migration = {
  id: CAPABILITY_ASSIGNMENTS_MIGRATION_ID,
  owner: 'kernel',
  up: `
    CREATE TABLE IF NOT EXISTS capability_assignments (
      scope_type     TEXT    NOT NULL,
      scope_id       INTEGER NOT NULL,
      capability_key TEXT    NOT NULL,
      enabled        INTEGER NOT NULL,
      updated_at     TEXT    NOT NULL,
      PRIMARY KEY (scope_type, scope_id, capability_key)
    );
    CREATE INDEX IF NOT EXISTS idx_capability_key ON capability_assignments (capability_key);
  `,
  down: `DROP TABLE IF EXISTS capability_assignments;`,
};

interface AssignmentRow {
  scope_type: string;
  scope_id: number;
  capability_key: string;
  enabled: number;
}

/** SQLite-backed assignment store. */
export function createSqliteAssignmentStore(db: Database): AssignmentStore {
  return {
    get(scopeType: ScopeType, scopeId: number, key: PermissionKey): boolean | undefined {
      const row = db
        .prepare(
          `SELECT enabled FROM capability_assignments
            WHERE scope_type = ? AND scope_id = ? AND capability_key = ?`,
        )
        .get(scopeType, scopeId, key) as { enabled: number } | undefined;
      return row ? row.enabled !== 0 : undefined;
    },

    list(scopeType?: ScopeType, scopeId?: number): CapabilityAssignment[] {
      const clauses: string[] = [];
      const params: Array<string | number> = [];
      if (scopeType !== undefined) {
        clauses.push('scope_type = ?');
        params.push(scopeType);
      }
      if (scopeId !== undefined) {
        clauses.push('scope_id = ?');
        params.push(scopeId);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM capability_assignments ${where} ORDER BY scope_type, scope_id, capability_key`)
        .all(...params) as AssignmentRow[];

      return rows.map((row) => ({
        scopeType: row.scope_type as ScopeType,
        scopeId: row.scope_id,
        capabilityKey: row.capability_key,
        enabled: row.enabled !== 0,
      }));
    },

    set(assignment: CapabilityAssignment): void {
      db.prepare(
        `INSERT INTO capability_assignments (scope_type, scope_id, capability_key, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (scope_type, scope_id, capability_key)
         DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      ).run(
        assignment.scopeType,
        assignment.scopeId,
        assignment.capabilityKey,
        assignment.enabled ? 1 : 0,
        new Date().toISOString(),
      );
    },
  };
}

/**
 * Copy existing `enable_*` column values into assignments for one class scope.
 *
 * Called by the compatibility layer rather than by a migration, because the column
 * names are domain knowledge the kernel must not hold: it reads whatever
 * `enable_`-prefixed keys the caller passes in.
 */
export function seedAssignments(
  store: AssignmentStore,
  scopeType: ScopeType,
  scopeId: number,
  values: Record<string, boolean>,
): number {
  let written = 0;
  for (const [key, enabled] of Object.entries(values)) {
    store.set({ scopeType, scopeId, capabilityKey: key, enabled });
    written += 1;
  }
  return written;
}
