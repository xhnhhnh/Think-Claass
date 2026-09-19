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
import { ROOT } from './lib/paths.mjs';

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
});
