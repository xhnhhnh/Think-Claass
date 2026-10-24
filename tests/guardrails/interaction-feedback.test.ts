/**
 * G25: a page does not get to invent a network failure.
 *
 * The audit behind the interaction round found the same lie in ~50 places: `src/lib/api.ts`
 * already toasted the server's sentence (`余额不足` / `无权限` / `账号或密码错误` / `无效的激活码`),
 * and the page's `catch` then added `网络错误` on top of it - or replaced it, because the page had
 * nothing else to show. Two toasts for one failure, and the second one sends the reader to check
 * their Wi-Fi for a permission problem.
 *
 * The rule is mechanical: **page code never contains a generic network claim**. A page that owns
 * an inline error uses `apiErrorMessage(error, fallback)` (which prefers the server's message and
 * knows what a timeout / an offline request means); otherwise the API layer's toast is the only
 * message. `src/lib/api.ts` is exempt because that is the one place that translates a transport
 * failure.
 *
 * The check strips comments first, so prose that describes the rule does not violate it - the same
 * mistake the `@apply` and public-surface guards made and corrected.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

/** The phrases a page may not produce. `api.ts` owns the translation. */
const FORBIDDEN = /网络错误|Network error|网络或服务器错误/g;

/** The one file allowed to describe a transport failure. */
const OWNER = 'src/lib/api.ts';

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Blank out comments while preserving line and column positions, so `file:line` stays true. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix: string) => prefix + ' '.repeat(match.length - prefix.length));
}

describe('G25 pages do not invent network failures', () => {
  it('keeps generic network claims out of page code', () => {
    const violations: string[] = [];

    for (const file of walk(path.join(ROOT, 'src'))) {
      const relative = path.relative(ROOT, file).replace(/\\/g, '/');
      if (relative === OWNER) continue;

      const text = stripComments(fs.readFileSync(file, 'utf8'));
      const lines = text.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        for (const match of line.matchAll(FORBIDDEN)) {
          violations.push(`${relative}:${index + 1} "${match[0]}" in: ${line.trim()}`);
        }
      }
    }

    expect(
      violations,
      violations.length === 0
        ? ''
        : [
            'A page may not replace or duplicate the server\'s failure reason with a network claim.',
            'Use apiErrorMessage(error, fallback) from src/lib/api.ts for an inline error, or let the',
            'API layer\'s toast be the only message. Offending sites:',
            ...violations,
          ].join('\n'),
    ).toEqual([]);
  });
});
