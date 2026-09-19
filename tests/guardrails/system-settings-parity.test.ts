/**
 * Guardrail G9 - the two system-settings default copies must not drift.
 *
 * `DEFAULT_SYSTEM_SETTINGS` is the only runtime value that lived in the contract
 * tree. It could not move into `packages/contracts` (type-only, G6), and neither
 * side can import the other's home:
 *   - the backend cannot import frontend modules
 *   - the frontend cannot import `@thinkclass/kernel` (it would pull express and
 *     better-sqlite3 into the browser bundle)
 *
 * So the value exists twice, both generated from one source block in P2. This test
 * is what makes that duplication safe: it compares the parsed object literals and
 * fails on any added, removed or changed key or value.
 *
 * It is deliberately static (text parsing, no imports) so it cannot be defeated by
 * the two modules resolving to different things at runtime.
 *
 * The duplication disappears in P4/P5 when the admin plugin declares its settings
 * and the frontend reads them from the plugin.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

const BACKEND = 'api/modules/admin/admin.defaults.ts';
const FRONTEND = 'src/lib/systemSettings.ts';
const CONSTANT = 'DEFAULT_SYSTEM_SETTINGS';

/**
 * Extract the object literal body of `export const DEFAULT_SYSTEM_SETTINGS = {...};`
 * and normalise it for comparison.
 */
function extractLiteral(relPath) {
  const abs = path.join(ROOT, relPath);
  expect(fs.existsSync(abs), `${relPath} is missing`).toBe(true);
  const source = fs.readFileSync(abs, 'utf8');

  const start = new RegExp(`^export const ${CONSTANT}\\b[^=]*=\\s*\\{`, 'm').exec(source);
  expect(start, `${relPath} does not declare ${CONSTANT}`).toBeTruthy();

  const body = source.slice(start.index + start[0].length);
  const end = body.indexOf('\n};');
  expect(end, `${relPath}: could not find the end of the object literal`).toBeGreaterThan(-1);

  return body
    .slice(0, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'))
    .join('\n');
}

/** Parse the literal into a plain key -> value record for a readable diff. */
function parseEntries(literal) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of literal.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?),?$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/,$/, '').trim();
  }
  return out;
}

describe('G9 system settings defaults parity', () => {
  const backendLiteral = extractLiteral(BACKEND);
  const frontendLiteral = extractLiteral(FRONTEND);

  it('both copies exist and declare the constant', () => {
    expect(backendLiteral.length).toBeGreaterThan(0);
    expect(frontendLiteral.length).toBeGreaterThan(0);
  });

  it('declare exactly the same keys', () => {
    const backendKeys = Object.keys(parseEntries(backendLiteral)).sort();
    const frontendKeys = Object.keys(parseEntries(frontendLiteral)).sort();
    expect(frontendKeys).toEqual(backendKeys);
    // A silently empty parse would make the comparison vacuous.
    expect(backendKeys.length).toBeGreaterThan(10);
  });

  it('declare exactly the same values', () => {
    expect(parseEntries(frontendLiteral)).toEqual(parseEntries(backendLiteral));
  });

  it('the frontend copy stays free of backend-only imports', () => {
    const source = fs.readFileSync(path.join(ROOT, FRONTEND), 'utf8');
    // Importing the kernel here would drag express/better-sqlite3 into the bundle.
    expect(source).not.toMatch(/from\s+['"]@thinkclass\/kernel['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*\/api\//);
  });
});
