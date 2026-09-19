/**
 * Guardrail G3 - no surface-only pluginization, and dead-code ratchet.
 *
 * G3 is the headline guard of this migration. The current `src/features/*` tree
 * LOOKS like vertical domain modules but 62 of its 67 page files are one-line
 * re-export shims over `src/pages/**`:
 *
 *     export { default } from '@/pages/Teacher/Pets';
 *
 * A plugin whose entire content is a re-export is not a plugin. This test forbids
 * that pattern anywhere under a plugin-owned tree and ratchets the existing count
 * to zero by P5.
 *
 * The dead-code ratchet rides along because it is the same disease: modules that
 * exist for appearance rather than for use.
 */

import { describe, expect, it } from 'vitest';

import { defaultEntryPoints, findDeadCode, findShimFiles } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, formatRatchet, readAllowances } from './lib/paths.mjs';

const APP_ENTRIES = defaultEntryPoints(ROOT);

/** Trees that are plugin-owned (or destined to be). */
const PLUGIN_OWNED_DIRS = ['src/features', 'plugins', 'plugins-ext'];

const allowances = readAllowances();

describe('G3 no surface-only pluginization', () => {
  const shims = findShimFiles(ROOT, PLUGIN_OWNED_DIRS);

  it('re-export shim count does not grow (target: 0 by P5)', () => {
    expect(
      shims.length,
      `One-line re-export shims are not plugins. Current list:\n${shims
        .map((s) => `  ${s.file}  ->  ${s.target}`)
        .join('\n')}`,
    ).toBeLessThanOrEqual(allowances.shimPages);
  });

  it('lowering the allowance is the only allowed change', () => {
    // Guard against someone "fixing" a regression by editing allowances.json upward.
    // Target reached in P5.2; a shim reappearing is a regression, not headroom.
    expect(allowances.shimPages).toBeLessThanOrEqual(0);
    expect(allowances.deadCode).toBeLessThanOrEqual(65);
    // Target reached in P5.2b; a static plugin route reappearing is a regression.
    expect(allowances.staticPluginRoutes).toBeLessThanOrEqual(0);
    expect(allowances.legacyFeatureKeySurfaces).toBeLessThanOrEqual(2);
  });
});

describe('G3 dead-code ratchet', () => {
  const dead = findDeadCode(ROOT, APP_ENTRIES);

  it('application-unreachable source files do not grow', () => {
    expect(
      dead.length,
      formatRatchet('dead code (app-unreachable, non-test)', dead.length, allowances.deadCode, dead),
    ).toBeLessThanOrEqual(allowances.deadCode);
  });
});
