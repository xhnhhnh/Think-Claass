#!/usr/bin/env node
/**
 * Generate the frontend class-feature catalogue from the plugin manifests.
 *
 * The 19 `enable_*` class-scope flags are declared once, in `plugins/classroom/plugin.json`,
 * as permissions with their labels. The frontend nevertheless repeated all 19 keys AND
 * their Chinese labels in `src/lib/classFeatures.ts`, and a second copy of a list is the
 * thing that drifts: adding a flag meant editing the manifest, the backend and the
 * frontend, and forgetting the third produced a UI that silently disagreed with the
 * server about which features exist.
 *
 * So this generates the catalogue instead of duplicating it:
 *
 *   node scripts/migration/class-features.mjs            # print what would be written
 *   node scripts/migration/class-features.mjs --check    # non-zero exit on drift
 *   node scripts/migration/class-features.mjs --update   # rewrite the generated file
 *
 * The generated module is committed, and `--check` runs in the guardrail suite, so the
 * manifest stays the source of truth and drift is a test failure rather than a bug
 * report. This is deliberately a build-time projection rather than a runtime fetch: the
 * feature flags are read synchronously during store hydration and route guarding, and
 * making the first render depend on a network round-trip would change behaviour that
 * nothing here needs to change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MANIFEST = path.join(ROOT, 'plugins', 'classroom', 'plugin.json');
const TARGET = path.join(ROOT, 'src', 'lib', 'classFeatures.generated.ts');

/** The prefix that marks a class-scope feature flag. */
const FLAG_PREFIX = 'enable_';

/**
 * The plugin that owns class-scope capabilities.
 *
 * Hardcoding the owner is intentional: the frontend needs to know which plugin's
 * permissions are class features, and that is a relationship, not a list. Renaming the
 * plugin would be a deliberate edit here.
 */
const OWNER = 'classroom';

function readCatalogue() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const permissions = manifest.provides?.permissions ?? [];

  return permissions
    .filter((permission) => String(permission.key).startsWith(`${OWNER}.`))
    .map((permission) => ({
      key: String(permission.key).slice(OWNER.length + 1),
      label: String(permission.label ?? permission.key),
      scope: String(permission.scope ?? 'class'),
    }))
    .filter((entry) => entry.key.startsWith(FLAG_PREFIX))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function render(entries) {
  const keys = entries.map((entry) => `  '${entry.key}',`).join('\n');
  const defaults = entries.map((entry) => `  '${entry.key}': false,`).join('\n');
  const labels = entries.map((entry) => `  '${entry.key}': '${entry.label}',`).join('\n');

  return `/**
 * GENERATED FILE - do not edit by hand.
 *
 * The class-scope feature catalogue, projected from \`plugins/${OWNER}/plugin.json\`, which
 * is where the flags and their labels are declared. Regenerate with:
 *
 *   npm run class-features          # rewrite
 *   npm run class-features:check    # verify (also runs in the guardrail suite)
 *
 * Editing this by hand reintroduces exactly the duplication it exists to remove: the
 * frontend and the server would disagree about which features exist, and the failure mode
 * is a page that 403s with no visible cause.
 */

export const classFeatureKeys = [
${keys}
] as const;

export type ClassFeatureKey = (typeof classFeatureKeys)[number];

export type ClassFeatures = Record<ClassFeatureKey, boolean>;

/** Every flag off: the state before a class's settings have loaded. */
export const defaultClassFeatures: ClassFeatures = {
${defaults}
};

export const classFeatureLabels: Record<ClassFeatureKey, string> = {
${labels}
};
`;
}

const mode = process.argv.includes('--update') ? 'update' : process.argv.includes('--check') ? 'check' : 'print';
const entries = readCatalogue();
const next = render(entries);

if (entries.length === 0) {
  process.stderr.write(
    `no class-scope feature flags found in plugins/${OWNER}/plugin.json; expected permissions named "${OWNER}.${FLAG_PREFIX}*"\n`,
  );
  process.exit(1);
}

if (mode === 'print') {
  process.stdout.write(`${entries.length} feature flags:\n`);
  for (const entry of entries) process.stdout.write(`  ${entry.key}  ${entry.label}\n`);
  process.exit(0);
}

if (mode === 'update') {
  fs.writeFileSync(TARGET, next, 'utf8');
  process.stdout.write(`wrote ${path.relative(ROOT, TARGET).replace(/\\/g, '/')} (${entries.length} flags)\n`);
  process.exit(0);
}

// --check
const rel = path.relative(ROOT, TARGET).replace(/\\/g, '/');
if (!fs.existsSync(TARGET)) {
  process.stderr.write(`${rel} is missing; run: npm run class-features\n`);
  process.exit(1);
}

const current = fs.readFileSync(TARGET, 'utf8');
if (current !== next) {
  process.stderr.write(
    `${rel} is out of date with plugins/${OWNER}/plugin.json.\n` +
      `The manifest is the source of truth for which class features exist; regenerate with:\n` +
      `  npm run class-features\n`,
  );
  process.exit(1);
}

process.stdout.write(`class feature catalogue matches the manifest (${entries.length} flags)\n`);
