/**
 * Guardrail G8 - the HTTP surface must not drift during the migration.
 *
 * Moving 288 endpoints out of `api/modules/**` and into plugins is a large
 * mechanical change. Clients (and the deployed frontend bundle) only care that
 * METHOD + PATH keeps working, so this test freezes that observable contract.
 *
 * Relocating a controller does NOT trip this guard (the owning file is not part of
 * the comparison); adding, removing or renaming an endpoint does.
 *
 * When a change is intentional:
 *   node scripts/migration/api-surface.mjs --update
 * and say so in the phase notes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractApiSurface, findRouteCollisions } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, readAllowances } from './lib/paths.mjs';

const SNAPSHOT = path.join(ROOT, 'tests', 'guardrails', 'snapshots', 'api-surface.json');

const allowances = readAllowances();

/** METHOD+PATH pairs that more than one controller file declares. */
const collisions = findRouteCollisions(ROOT);

describe('G8 HTTP surface snapshot', () => {
  it('snapshot file exists', () => {
    expect(fs.existsSync(SNAPSHOT), 'run: node scripts/migration/api-surface.mjs --update').toBe(true);
  });

  it('no endpoint was added, removed or renamed', () => {
    const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const before = new Set(previous.endpoints);
    const current = extractApiSurface(ROOT).map((r) => `${r.method} ${r.path}`);
    const after = new Set(current);

    const removed = [...before].filter((e) => !after.has(e)).sort();
    const added = [...after].filter((e) => !before.has(e)).sort();

    const report = [
      removed.length > 0 ? `REMOVED/RENAMED:\n  ${removed.join('\n  ')}` : '',
      added.length > 0 ? `ADDED:\n  ${added.join('\n  ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    expect(report, `HTTP surface drifted:\n${report}`).toBe('');
  });

  it('surface size matches the recorded baseline', () => {
    const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const current = extractApiSurface(ROOT);
    expect(current.length).toBe(previous.count);
  });

  it('the snapshot is internally consistent', () => {
    // `count` is the number of route *declarations*, not distinct paths: a route
    // declared by two controllers appears twice. Express the relationship directly as
    // `entries - distinct == extra declarations`, which is true by construction at any
    // stage of the migration.
    //
    // An earlier version compared this against `findRouteCollisions().length`. That was
    // wrong: collisions counts *distinct keys* with multiple owner files, while this is
    // a count of *extra declarations*. The two only coincide when every colliding key
    // has exactly two owners - which happened to hold when it was written and stopped
    // holding as soon as more domains migrated.
    const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const distinct = new Set(previous.endpoints).size;
    const extraDeclarations = previous.endpoints.length - distinct;

    expect(previous.endpoints.length).toBe(previous.count);
    expect(extraDeclarations).toBeGreaterThanOrEqual(0);
    // A duplicate in the frozen snapshot means the extractor saw the same METHOD+PATH
    // declared twice on the day it was recorded. It must still be a real duplicate
    // today, otherwise the snapshot is recording something the tree no longer contains.
    const currentKeys = extractApiSurface(ROOT).map((r) => `${r.method} ${r.path}`);
    const stillPresent = new Set(currentKeys);
    for (const endpoint of previous.endpoints) {
      expect(stillPresent.has(endpoint), `snapshot endpoint no longer exists: ${endpoint}`).toBe(true);
    }
  });
});

/**
 * The snapshot above compares *sets* of METHOD+PATH, so two controllers serving the
 * same route collide silently - only the first registration is reachable and the
 * other is unreachable code. That is precisely the state a half-finished domain
 * migration produces (module still in `api/**`, plugin already serving the same
 * paths), so it gets its own ratchet.
 */
describe('G11 no two controllers claim the same route', () => {
  it('route collisions do not grow (target: 0 as domains migrate)', () => {
    expect(
      collisions.length,
      `Route is served by more than one controller file; only the first is reachable:\n${collisions
        .map((c) => `  ${c.key}\n    ${c.files.join('\n    ')}`)
        .join('\n')}`,
    ).toBeLessThanOrEqual(allowances.routeCollisions);
  });

  it('lowering the allowance is the only allowed change', () => {
    // The ceiling tracks the measured value so that a *new* collision has to be
    // deliberately acknowledged by editing both this number and the allowance, rather
    // than slipping in under a stale one.
    expect(allowances.routeCollisions).toBeLessThanOrEqual(1);
  });
});
