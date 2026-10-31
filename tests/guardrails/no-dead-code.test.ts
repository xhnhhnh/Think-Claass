/**
 * G25 - the P7 cleanup stays closed.
 *
 * The old `src/api/*` compatibility layer and its dead wrappers were the P7 cleanup
 * list. This guard keeps three properties true:
 *
 *   1. Every application/test entry reaches the same source tree (no orphan files).
 *   2. The legacy compatibility tree cannot quietly return.
 *   3. No exported declaration is left without a consumer.
 *
 * The unused-export check is a script rather than an in-test AST walk so the same
 * implementation can be run locally (`npm run check:exports`) with a readable report.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultEntryPoints, findDeadCode } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT } from './lib/paths.mjs';

describe('G25 P7 cleanup stays closed', () => {
  it('has no application-unreachable source files', () => {
    const dead = findDeadCode(ROOT, [...defaultEntryPoints(ROOT), 'src/setupTests.ts']);
    expect(dead, `Application-unreachable files:\n${dead.join('\n')}`).toEqual([]);
  });

  it('does not bring back the legacy src/api compatibility tree', () => {
    expect(fs.existsSync(path.join(ROOT, 'src', 'api'))).toBe(false);
  });

  it('has no exported declaration without a consumer', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/quality/unused-exports.mjs', '--check'], {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
      }),
    ).not.toThrow();
  });
});
