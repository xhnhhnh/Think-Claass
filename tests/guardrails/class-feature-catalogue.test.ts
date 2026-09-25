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

  /**
   * `featureRoutes.ts` declares the flag→route relationship twice, for two different consumers:
   * `classFeatureRouteMap` answers "which pages does this flag govern" (used to decide what a
   * feature toggle controls), and `studentFeatureRequirements` / `parentFeatureRequirements` answer
   * "which flag does this page need" (used by the guard and the menu).
   *
   * They drifted: `/student/challenge` was reachable on `enable_challenge` alone while
   * `classFeatureRouteMap` claimed `enable_world_boss` governed it too - so the world-boss switch
   * appeared to control a page it could not actually open. Nothing caught it, because each map was
   * only ever read by one consumer.
   */
  it('the two per-flag route maps agree about every route', () => {
    const text = fs.readFileSync(ROUTES, 'utf8');

    /** The slice of `text` from `const <name>` up to the closing `};` of that object literal. */
    const blockOf = (name: string): string => {
      const start = text.indexOf(`const ${name}`);
      expect(start, `${name} is missing from featureRoutes.ts`).toBeGreaterThan(-1);
      const end = text.indexOf('\n};', start);
      expect(end, `${name} has no closing brace`).toBeGreaterThan(start);
      return text.slice(start, end);
    };

    /** `{ '/student/x': { key: 'a' } }` and `{ key: 'a' | anyOf: ['a','b'] }` → route → flags. */
    const requirementMap = (name: string): Map<string, string[]> => {
      const entries = new Map<string, string[]>();
      const body = blockOf(name).slice(blockOf(name).indexOf('{') + 1);
      for (const entry of body.matchAll(/'([^']+)':\s*(\{[^}]*\})/g)) {
        entries.set(
          entry[1],
          [...entry[2].matchAll(/'((?:enable)_[a-z_]+)'/g)].map((m) => m[1]).sort(),
        );
      }
      return entries;
    };

    /**
     * Reverse the flag→routes map into route→flags, which is what the requirement maps say.
     *
     * The keys here are unquoted (`enable_shop: [...]`) while the requirement maps quote their route
     * keys and their flags, so the two patterns are deliberately different.
     */
    const expected = new Map<string, string[]>();
    for (const entry of blockOf('classFeatureRouteMap').matchAll(
      /^\s*(enable_[a-z_]+):\s*\[([^\]]*)\]/gm,
    )) {
      for (const route of entry[2].matchAll(/'([^']+)'/g)) {
        expected.set(route[1], [...(expected.get(route[1]) ?? []), entry[1]].sort());
      }
    }
    expect(expected.size, 'classFeatureRouteMap parsed empty - the pattern went stale').toBeGreaterThan(0);

    const student = requirementMap('studentFeatureRequirements');
    const parent = requirementMap('parentFeatureRequirements');

    // A route one map gates must be gated by exactly the same flags in the other.
    for (const [name, actual] of [
      ['studentFeatureRequirements', student],
      ['parentFeatureRequirements', parent],
    ] as const) {
      for (const [route, flags] of actual) {
        expect(
          expected.get(route),
          `${name}['${route}'] requires ${flags.join('/')}, but classFeatureRouteMap says that ` +
            `route is governed by ${expected.get(route)?.join('/') ?? 'no flag'}. The feature ` +
            'toggle and the page it controls must agree.',
        ).toEqual(flags);
      }
    }

    // And the other direction: a flag claiming to govern a route no requirement map names is a
    // toggle with no effect.
    for (const [route, flags] of expected) {
      expect(
        student.has(route) || parent.has(route),
        `classFeatureRouteMap says ${flags.join('/')} governs '${route}', but no requirement map ` +
          'names that route - the switch would have no effect.',
      ).toBe(true);
    }
  });
});

/**
 * The route page-module map is generated from the route table for the same reason: two hand-kept
 * lists drift. A stale map is worse than a missing one - the route exists, the page exists, and
 * the lookup returns undefined at render time.
 *
 * This replaced an `import.meta.glob` version that failed in three separate ways: the build
 * rejects alias globs that vitest accepts, the key format differs between the two, and a glob
 * bundles every matched file before any filter runs (it shipped a 458 kB chunk of
 * react-dom-test-utils). The generator's header records that history.
 */
describe('G15 the route module map stays derived', () => {
  const GENERATOR = path.join(ROOT, 'scripts', 'migration', 'route-modules.mjs');
  const MAP = path.join(ROOT, 'src', 'app', 'routing', 'pageModules.generated.ts');

  it('the generated map matches the route table', () => {
    let output = '';
    let failed = false;
    try {
      output = execFileSync(process.execPath, [GENERATOR, '--check'], { cwd: ROOT, encoding: 'utf8' });
    } catch (error) {
      failed = true;
      output = error instanceof Error ? error.message : String(error);
    }

    expect(failed, `generated route module map is stale:\n${output}`).toBe(false);
    expect(output).toContain('matches the route table');
  });

  it('the map is not empty and names no test module', () => {
    const text = fs.readFileSync(MAP, 'utf8');
    const entries = [...text.matchAll(/^\s+'(@\/[^']+)':/gm)].map((m) => m[1]);

    // Both directions matter: an empty map makes the check above vacuous, and a test module
    // pulled into a route chunk is what made the glob approach unusable.
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((entry) => entry.includes('.test'))).toEqual([]);
  });
});
