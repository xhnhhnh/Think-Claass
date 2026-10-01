/**
 * G21 - the teacher's feature panel offers every class feature.
 *
 * `ClassFeaturePanel` is the *only* place a teacher can switch a class feature on: the columns exist
 * in the database, the server gates on them, the mini program reads them - but the panel's `groups`
 * list is hand-written, and it was one short. `enable_ai_study` had a route, a permission, a student
 * page, a teacher board and a mini-program tab, and no way to be switched on from the web console;
 * the feature was unreachable-by-default for every class.
 *
 * A short list here does not fail anywhere else, which is why this is a guardrail: the panel is
 * compared against the generated catalogue (`classFeatureKeys`), not against a copy of itself.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { classFeatureKeys } from '@/lib/classFeatures.generated';

import { ROOT } from './lib/paths.mjs';

const PANEL = 'src/pages/Teacher/components/ClassFeaturePanel.tsx';

/** Every `enable_*` literal inside the panel's `groups` array, in source order. */
function panelKeys(): string[] {
  const source = fs.readFileSync(path.join(ROOT, PANEL), 'utf8');
  const start = source.indexOf('const groups');
  expect(start, `${PANEL} no longer declares \`groups\``).toBeGreaterThan(-1);
  const end = source.indexOf('];', start);
  expect(end, `${PANEL}: could not find the end of the groups array`).toBeGreaterThan(start);

  const body = source.slice(start, end);
  const keys = [...body.matchAll(/'(enable_[a-z_]+)'/g)].map((match) => match[1]);
  // Duplicates would mean a switch rendered twice, which is a defect of its own.
  expect(new Set(keys).size, `${PANEL}: a flag is listed twice`).toBe(keys.length);
  return keys;
}

describe('G21: the class-feature panel covers the whole catalogue', () => {
  it('offers every flag the catalogue declares', () => {
    const declared = [...classFeatureKeys].sort();
    const offered = [...panelKeys()].sort();

    expect(offered).toEqual(declared);
  });
});
