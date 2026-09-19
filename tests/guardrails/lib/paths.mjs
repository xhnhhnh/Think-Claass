/**
 * Shared helpers for the migration guardrail suite.
 *
 * Every guardrail is a RATCHET: it compares the current violation count against a
 * recorded allowance and fails when the count grows. Allowances may only be
 * lowered. This keeps `pnpm guard` green today (so red always means "you broke
 * something") while still forcing the debt to zero phase by phase.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repository root. */
export const ROOT = path.resolve(HERE, '..', '..', '..');

export const ALLOWANCES_FILE = path.join(HERE, 'allowances.json');

/** @typedef {{ shimPages: number, deadCode: number, staticPluginRoutes: number, legacyFeatureKeySurfaces: number }} Allowances */

/** @returns {Allowances} */
export function readAllowances() {
  return JSON.parse(fs.readFileSync(ALLOWANCES_FILE, 'utf8'));
}

/** @param {Allowances} next */
export function writeAllowances(next) {
  fs.writeFileSync(ALLOWANCES_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

/** @param {string} rel */
export function abs(rel) {
  return path.join(ROOT, rel);
}

/** @param {string} rel */
export function exists(rel) {
  return fs.existsSync(abs(rel));
}

/**
 * Describe a ratchet result.
 * @param {string} name
 * @param {number} actual
 * @param {number} allowed
 * @param {string[]} [examples]
 */
export function formatRatchet(name, actual, allowed, examples = []) {
  const lines = [`${name}: ${actual} (allowance ${allowed})`];
  if (examples.length > 0) {
    lines.push(...examples.slice(0, 20).map((e) => `    ${e}`));
    if (examples.length > 20) lines.push(`    ... and ${examples.length - 20} more`);
  }
  return lines.join('\n');
}
