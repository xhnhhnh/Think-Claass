/**
 * No at-rest encryption key may live in the source.
 *
 * ## Why this guardrail exists
 *
 * A privacy audit of the public repository (P4.3b.15) found `api/db.ts` falling back to
 * `process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'`. That literal is in every
 * clone, so a deployment that never set the variable was encrypting children's names with a key
 * anybody could read - and the live database was doing exactly that (3 of 3 student names decrypted
 * with it). `plugins/classroom/src/classroom.support.ts` mirrored the same default.
 *
 * A key with a public fallback is worse than no key, because it looks like encryption. The fix
 * removed both fallbacks and made the missing key an error; this test is what keeps it removed. It
 * is cheap and mechanical, and it is the kind of regression that would otherwise come back as a
 * convenience during a refactor.
 *
 * Two shapes are rejected:
 *   1. the exact published literal, anywhere in source;
 *   2. `ENCRYPTION_KEY` followed by `||` or `??` and a string literal - i.e. any new default,
 *      whatever value it has. A guardrail against one known string would only catch the past.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

/** Everywhere application or plugin code could plausibly carry a key. */
const SCANNED_DIRS = ['api', 'packages', 'plugins', 'scripts', 'src'];

const PUBLISHED_LEGACY_KEY = '12345678901234567890123456789012';
/** `ENCRYPTION_KEY || '...'`, `ENCRYPTION_KEY ?? "..."`, or a default passed as a second argument. */
const FALLBACK_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'ENCRYPTION_KEY with a || / ?? default', re: /ENCRYPTION_KEY[^\n]{0,40}(\|\||\?\?)[^\n]{0,20}['"][^'"]+['"]/ },
  { name: "get('ENCRYPTION_KEY', <literal>)", re: /ENCRYPTION_KEY['"]?\s*,\s*['"][^'"]+['"]/ },
];

function sourceFiles(dir: string): string[] {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];

  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) found.push(full);
    }
  };
  walk(absolute);
  return found;
}

describe('G18 the at-rest encryption key is never defaulted in source', () => {
  const files = SCANNED_DIRS.flatMap(sourceFiles);

  it('scans the source tree (informational)', () => {
    // A silently empty scan is the failure mode of every static guardrail.
    expect(files.length).toBeGreaterThan(50);
  });

  it('does not contain the published legacy key', () => {
    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes(PUBLISHED_LEGACY_KEY));
    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it('does not fall back to any other literal key', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const { name, re } of FALLBACK_PATTERNS) {
        if (re.test(text)) offenders.push(`${path.relative(ROOT, file)} (${name})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
