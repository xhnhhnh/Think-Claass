/**
 * G14 - the generated class-feature catalogue must match the manifest, and the frontend's
 * route table must only name flags that exist.
 *
 * Replaces the duplication guardrail G5 used to enforce by counting hardcoded keys. That
 * count is now zero, which is only meaningful if something keeps it meaningful: a generated
 * file can go stale (someone edits the manifest and forgets to regenerate) and a route table
 * can name a flag that no longer exists (the type system catches it at compile time, but
 * only for keys that were valid when the file was written).
 *
 * So this asserts the two relationships that make the frontend's feature gating safe:
 *
 *   1. `src/lib/classFeatures.generated.ts` is exactly what the manifest produces;
 *   2. every flag named in `src/lib/featureRoutes.ts` is a flag the manifest declares.
 *
 * Both failures are otherwise silent in the worst direction: a page gated on a flag that no
 * longer exists is simply never reachable.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

const GENERATOR = path.join(ROOT, 'scripts', 'migration', 'class-features.mjs');
const GENERATED = path.join(ROOT, 'src', 'lib', 'classFeatures.generated.ts');
const ROUTES = path.join(ROOT, 'src', 'lib', 'featureRoutes.ts');

/** Flags named as string literals in a source file. */
function flagsNamedIn(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const found = new Set<string>();
  for (const match of text.matchAll(/'((?:enable)_[a-z_]+)'/g)) found.add(match[1]);
  return [...found].sort();
}

/** Flags the generated catalogue declares. */
function generatedFlags(): string[] {
  const text = fs.readFileSync(GENERATED, 'utf8');
  const block = /export const classFeatureKeys = \[([\s\S]*?)\] as const;/.exec(text);
  if (!block) throw new Error('could not read classFeatureKeys from the generated module');
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe('G14 class-feature catalogue stays derived', () => {
  it('the generated module matches the manifest', () => {
    // Running the generator in check mode is the point: it compares against the manifest
    // rather than against a snapshot, so a manifest edit that is not regenerated fails.
    let output = '';
    let failed = false;
    try {
      output = execFileSync(process.execPath, [GENERATOR, '--check'], { cwd: ROOT, encoding: 'utf8' });
    } catch (error) {
      failed = true;
      output = error instanceof Error ? error.message : String(error);
    }

    expect(failed, `generated catalogue is stale:\n${output}`).toBe(false);
    expect(output).toContain('matches the manifest');
  });

  it('the catalogue is not empty', () => {
    // A generator that silently produced nothing would make every gate below vacuous.
    expect(generatedFlags().length).toBeGreaterThan(0);
  });

  it('every flag named by the frontend route table exists in the catalogue', () => {
    const known = new Set(generatedFlags());
    const named = flagsNamedIn(ROUTES);
    const unknown = named.filter((flag) => !known.has(flag));

    expect(
      unknown,
      `featureRoutes.ts names flags the manifest does not declare: ${unknown.join(', ')}. ` +
        'A page gated on an unknown flag is never reachable.',
    ).toEqual([]);
  });

  it('the catalogue module is generated, not hand-written', () => {
    const text = fs.readFileSync(GENERATED, 'utf8');
    expect(text).toContain('GENERATED FILE - do not edit by hand');
    expect(text).toContain('plugins/classroom/plugin.json');
  });
});
