/**
 * Guardrail G7 - plugin manifests must be well formed and must obey the data
 * ownership rules.
 *
 * This is the static half of plugin conformance. The runtime half (every route,
 * permission, event, job and menu a plugin registers must be declared in its
 * manifest) lands in P3 with `@thinkclass/plugin-testkit`, because it needs the
 * plugin runtime to observe registrations.
 *
 * Passes trivially until the first plugin appears in P3.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { toRel } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, readAllowances } from './lib/paths.mjs';

const allowances = readAllowances();

const PLUGIN_ROOTS = ['plugins', 'plugins-ext'];

const TIERS = new Set(['foundation', 'feature']);
const ISOLATION = new Set(['in-process', 'restricted', 'worker']);
const REQUIRED_STRING_FIELDS = ['id', 'name', 'version', 'kernel', 'tier'];

/** Derive the table-prefix slug from a plugin id. */
function slugOf(id) {
  return id.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

/**
 * Locate every manifest.json for a plugin, including versioned installs under
 * plugins-ext/<id>/<version>/manifest.json.
 * @returns {Array<{ rel: string, manifest: any }>}
 */
function findManifests() {
  const found = [];
  for (const rootDir of PLUGIN_ROOTS) {
    const abs = path.join(ROOT, rootDir);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidates = [
        path.join(abs, entry.name, 'manifest.json'),
        path.join(abs, entry.name, 'plugin.json'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          found.push({
            rel: toRel(ROOT, candidate),
            manifest: JSON.parse(fs.readFileSync(candidate, 'utf8')),
          });
        }
      }
    }
  }
  return found;
}

describe('G7 plugin manifest conformance', () => {
  const manifests = findManifests();

  it('required fields are present', () => {
    if (manifests.length === 0) {
      console.info('[G7] no plugin manifests yet - guard becomes load-bearing at P3');
    }
    const problems = [];
    for (const { rel, manifest } of manifests) {
      for (const field of REQUIRED_STRING_FIELDS) {
        if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
          problems.push(`${rel}: missing or empty "${field}"`);
        }
      }
      if (manifest.tier && !TIERS.has(manifest.tier)) {
        problems.push(`${rel}: invalid tier "${manifest.tier}"`);
      }
      if (manifest.isolation && !ISOLATION.has(manifest.isolation)) {
        problems.push(`${rel}: invalid isolation "${manifest.isolation}"`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('tier "foundation" implies required: true', () => {
    const problems = [];
    for (const { rel, manifest } of manifests) {
      if (manifest.tier === 'foundation' && manifest.required !== true) {
        problems.push(`${rel}: foundation plugins must set "required": true`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('declared tables are namespaced to the plugin', () => {
    const problems = [];
    for (const { rel, manifest } of manifests) {
      const slug = manifest.slug ?? slugOf(String(manifest.id ?? ''));
      const prefix = `p_${slug}_`;
      for (const table of manifest.data?.tables ?? []) {
        if (!String(table).startsWith(prefix)) {
          problems.push(`${rel}: table "${table}" must start with "${prefix}"`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('does not depend on itself and declares only string version ranges', () => {
    const problems = [];
    for (const { rel, manifest } of manifests) {
      for (const [dep, range] of Object.entries(manifest.dependsOn ?? {})) {
        if (dep === manifest.id) problems.push(`${rel}: depends on itself`);
        if (typeof range !== 'string' || range.trim() === '') {
          problems.push(`${rel}: dependency "${dep}" has no version range`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('declares every service it publishes under its own slug', () => {
    const problems = [];
    for (const { rel, manifest } of manifests) {
      const slug = manifest.slug ?? slugOf(String(manifest.id ?? ''));
      for (const service of manifest.provides?.services ?? []) {
        const owner = String(service.name).split('.')[0];
        if (owner !== slug) {
          problems.push(`${rel}: service "${service.name}" is not namespaced under "${slug}"`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('route permissions are declared in the same manifest', () => {
    const problems = [];
    for (const { rel, manifest } of manifests) {
      const declared = new Set((manifest.provides?.permissions ?? []).map((p: { key: string }) => p.key));
      for (const route of manifest.provides?.routes ?? []) {
        for (const key of route.permissions ?? []) {
          if (!declared.has(key)) {
            problems.push(`${rel}: route ${route.method} ${route.base} requires undeclared permission "${key}"`);
          }
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

/**
 * G10 - transitional table adoption must shrink, never grow.
 *
 * A `data.adopted` entry means "this plugin owns a table that still carries its
 * legacy name". It exists so a foundation plugin can own `students` before the
 * namespace migration has renamed it, without either lying about ownership or
 * breaking the `p_<slug>_` rule. Every entry is debt with a finite life, so the
 * total is ratcheted.
 *
 * One exception, listed explicitly rather than buried in the allowance: a small set
 * of *permanently shared* tables is written by nearly every domain and will never be
 * namespaced to one plugin. Renaming such a table would fragment one ledger into ten,
 * and its column names are the JSON contract the frontend already reads. Counting a
 * permanent fact as debt would make the ratchet permanently wrong - so these are
 * excluded from the count, but still declared, so ownership stays visible.
 */
const PERMANENTLY_SHARED_TABLES = new Set(['records']);

describe('G10 adopted legacy tables ratchet', () => {
  const allAdopted = findManifests().flatMap(({ rel, manifest }) =>
    (manifest.data?.adopted ?? []).map((table: string) => ({ rel, table })),
  );
  const adopted = allAdopted.filter((entry) => !PERMANENTLY_SHARED_TABLES.has(entry.table));

  it('every permanently-shared table is declared by exactly one plugin', () => {
    const problems = [];
    for (const table of PERMANENTLY_SHARED_TABLES) {
      const owners = allAdopted.filter((entry) => entry.table === table);
      if (owners.length === 0) problems.push(`"${table}" should be declared by one plugin but is declared by none`);
      if (owners.length > 1) problems.push(`"${table}" is declared by ${owners.map((o) => o.rel).join(', ')}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('transitional debt does not grow (target: 0 when the namespace migration completes)', () => {
    expect(
      adopted.length,
      `Plugins owning legacy-named tables:\n${adopted.map((a) => `  ${a.rel}: ${a.table}`).join('\n')}`,
    ).toBeLessThanOrEqual(allowances.adoptedTables);
  });

  it('the allowance tracks the measured count', () => {
    // Same reasoning as the route-collision ceiling: an increment must be an explicit
    // edit in two places, because migrating a domain is the only legitimate reason for
    // this number to move.
    expect(allowances.adoptedTables).toBeLessThanOrEqual(32);
  });

  it('never declares a table as both owned and adopted', () => {
    const problems = [];
    for (const { rel, manifest } of findManifests()) {
      const owned = new Set<string>(manifest.data?.tables ?? []);
      for (const table of manifest.data?.adopted ?? []) {
        if (owned.has(table)) problems.push(`${rel}: "${table}" is in both data.tables and data.adopted`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  /**
   * Two plugins claiming the same table is the ownership equivalent of a route
   * collision: both believe they may write it, and the guarantee that "this table has
   * exactly one writer" - the reason `data.adopted` exists at all - quietly stops
   * holding. Nothing else in the suite notices, because `data.reads` on a table
   * someone else owns is legitimate and per-plugin validation cannot see across
   * manifests.
   *
   * The exceptions are deliberate and enumerated. Each one is a table whose write
   * operations genuinely span two domains today, and each needs a real port (or a
   * re-decision of ownership) rather than a permanent exemption.
   */
  const SHARED_WRITE_TABLES = new Set(['redemption_tickets']);

  it('no two plugins adopt the same table', () => {
    const ownersByTable = new Map<string, string[]>();
    for (const entry of allAdopted) {
      const owners = ownersByTable.get(entry.table) ?? [];
      owners.push(entry.rel);
      ownersByTable.set(entry.table, owners);
    }

    const problems: string[] = [];
    for (const [table, owners] of [...ownersByTable].sort()) {
      if (owners.length < 2) continue;
      if (SHARED_WRITE_TABLES.has(table)) continue;
      problems.push(`"${table}" is adopted by ${owners.join(' and ')}; only one plugin may own it`);
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('shared-write tables are still claimed by at least one plugin', () => {
    // Guards the exception list itself: once the overlap is resolved the entry should
    // be deleted, and a stale entry would otherwise silently permit a future overlap.
    const ownersByTable = new Map<string, string[]>();
    for (const entry of allAdopted) {
      ownersByTable.set(entry.table, [...(ownersByTable.get(entry.table) ?? []), entry.rel]);
    }

    const problems: string[] = [];
    for (const table of SHARED_WRITE_TABLES) {
      const owners = ownersByTable.get(table) ?? [];
      if (owners.length === 0) {
        problems.push(`"${table}" is listed as a shared-write table but no plugin adopts it; remove the exemption`);
      }
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });
});
