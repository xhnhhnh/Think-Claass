/**
 * Plugin state persistence.
 *
 * The runtime writes what it resolved into `__plugins` on every boot. That gives
 * the admin surface something durable to show ("installed, currently blocked
 * because X"), and gives operators a record of which version ran when - neither of
 * which the baseline had for anything.
 *
 * The manifest hash makes tampering visible: a plugin whose `plugin.json` changed
 * after it was recorded is reported rather than silently accepted.
 */

import crypto from 'node:crypto';

import type { PluginManifest } from '@thinkclass/contracts';
import type { Database, Migration } from '@thinkclass/kernel';

export const PLUGINS_MIGRATION_ID = '0003_kernel_plugin_state';

/** Kernel-owned table recording every plugin the runtime has seen. */
export const pluginsMigration: Migration = {
  id: PLUGINS_MIGRATION_ID,
  owner: 'kernel',
  up: `
    CREATE TABLE IF NOT EXISTS __plugins (
      id             TEXT PRIMARY KEY,
      version        TEXT NOT NULL,
      tier           TEXT NOT NULL,
      required       INTEGER NOT NULL DEFAULT 0,
      enabled        INTEGER NOT NULL DEFAULT 1,
      state          TEXT NOT NULL,
      reason         TEXT,
      directory      TEXT NOT NULL,
      manifest_hash  TEXT NOT NULL,
      installed_at   TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plugins_state ON __plugins (state);
  `,
  down: `DROP TABLE IF EXISTS __plugins;`,
};

export interface PluginStateRow {
  id: string;
  version: string;
  tier: string;
  required: number;
  enabled: number;
  state: string;
  reason: string | null;
  directory: string;
  manifest_hash: string;
  installed_at: string;
  updated_at: string;
}

export interface RecordPluginInput {
  id: string;
  version: string;
  tier: string;
  required: boolean;
  directory: string;
  state: string;
  /** Hash of the manifest as loaded, for tamper detection. */
  manifestHash: string;
  /** Why the plugin is not active, when it is not. */
  reason?: string | null;
  enabled?: boolean;
}

export interface PluginStateStore {
  record(input: RecordPluginInput): void;
  get(id: string): PluginStateRow | undefined;
  list(): PluginStateRow[];
  setState(id: string, state: string, reason?: string | null): void;
  setEnabled(id: string, enabled: boolean): void;
  remove(id: string): void;
  /** Remove rows for plugins that are no longer present on disk. */
  prune(keepIds: Iterable<string>): number;
  /** True when the recorded manifest hash differs from the current one. */
  hasManifestChanged(id: string, manifest: PluginManifest): boolean;
}

export function hashManifest(manifest: PluginManifest): string {
  // Stable key order so a re-serialised manifest hashes identically.
  const canonical = JSON.stringify(manifest, Object.keys(manifest).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function createPluginStateStore(db: Database): PluginStateStore {
  const now = () => new Date().toISOString();

  return {
    record(input) {
      const timestamp = now();
      db.prepare(
        `INSERT INTO __plugins (id, version, tier, required, enabled, state, reason, directory, manifest_hash, installed_at, updated_at)
         VALUES (@id, @version, @tier, @required, @enabled, @state, @reason, @directory, @manifest_hash, @timestamp, @timestamp)
         ON CONFLICT(id) DO UPDATE SET
           version = excluded.version,
           tier = excluded.tier,
           required = excluded.required,
           state = excluded.state,
           reason = excluded.reason,
           directory = excluded.directory,
           manifest_hash = excluded.manifest_hash,
           updated_at = excluded.updated_at`,
      ).run({
        id: input.id,
        version: input.version,
        tier: input.tier,
        required: input.required ? 1 : 0,
        enabled: input.enabled === false ? 0 : 1,
        state: input.state,
        reason: input.reason ?? null,
        directory: input.directory,
        manifest_hash: input.manifestHash,
        timestamp,
      });
    },

    get(id) {
      return db.prepare(`SELECT * FROM __plugins WHERE id = ?`).get(id) as PluginStateRow | undefined;
    },

    list() {
      return db.prepare(`SELECT * FROM __plugins ORDER BY id`).all() as PluginStateRow[];
    },

    setState(id, state, reason = null) {
      db.prepare(`UPDATE __plugins SET state = ?, reason = ?, updated_at = ? WHERE id = ?`).run(
        state,
        reason,
        now(),
        id,
      );
    },

    setEnabled(id, enabled) {
      db.prepare(`UPDATE __plugins SET enabled = ?, updated_at = ? WHERE id = ?`).run(enabled ? 1 : 0, now(), id);
    },

    remove(id) {
      db.prepare(`DELETE FROM __plugins WHERE id = ?`).run(id);
    },

    prune(keepIds) {
      const keep = new Set(keepIds);
      const rows = db.prepare(`SELECT id FROM __plugins`).all() as Array<{ id: string }>;
      let removed = 0;
      const statement = db.prepare(`DELETE FROM __plugins WHERE id = ?`);
      for (const row of rows) {
        if (keep.has(row.id)) continue;
        statement.run(row.id);
        removed += 1;
      }
      return removed;
    },

    hasManifestChanged(id, manifest) {
      const row = this.get(id);
      if (!row) return false;
      return row.manifest_hash !== hashManifest(manifest);
    },
  };
}
