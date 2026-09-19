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
    // declared by two controllers appears twice. The two numbers below account for
    // that exactly, so a stale `count` cannot silently become the baseline.
    const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const distinct = new Set(previous.endpoints).size;
    const duplicates = previous.endpoints.length - distinct;

    expect(previous.endpoints.length).toBe(previous.count);
    expect(duplicates).toBe(collisions.length);
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
    expect(allowances.routeCollisions).toBeLessThanOrEqual(1);
  });
});
