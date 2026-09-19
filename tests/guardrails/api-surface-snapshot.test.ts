/**
 * Guardrail G8 - the HTTP surface must not drift during the migration.
 *
 * Moving hundreds of endpoints out of `api/modules/**` and into plugins is a large
 * mechanical change. Clients (and the deployed frontend bundle) only care that
 * METHOD + PATH keeps working, so this test freezes that observable contract.
 *
 * Relocating a controller does NOT trip this guard (the owning file is not part of
 * the comparison); adding, removing or renaming an endpoint does.
 *
 * The extractor reads two registration styles, because an endpoint can leave a Nest
 * controller for the kernel router without changing reachability:
 *   @Controller + @Get  (api/**, plugins/**)
 *   router.get('/api/x', ...)  (packages/kernel/**)
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
    // Compare on the same unit the snapshot records: distinct METHOD+PATH. The
    // extractor returns declarations, so `extractApiSurface(ROOT).length` counts a
    // doubly-registered route twice and would report drift for a duplicate that the
    // snapshot deliberately does not record.
    const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const current = new Set(extractApiSurface(ROOT).map((r) => `${r.method} ${r.path}`));
    expect(current.size).toBe(previous.count);
  });

  it('the snapshot is internally consistent', () => {
    // The snapshot records *distinct* METHOD+PATH pairs, so its list must be free of
    // duplicates and `count` must equal its length.
    //
    // An earlier version recorded route *declarations* and expressed the relationship as
    // `entries - distinct == extra declarations`. That made `count` and `endpoints.length`
    // disagree by exactly the number of duplicate registrations, and the two numbers were
    // asserted in two different files with two different meanings - which is how adding
    // the kernel router (a second `GET /api/health` declaration) looked like a size
    // mismatch rather than a duplicate. Duplicates are G11's ratchet now, and this file
    // is a set.
    const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

    expect(previous.endpoints.length).toBe(previous.count);
    expect(new Set(previous.endpoints).size).toBe(previous.endpoints.length);

    // Non-vacuous in the other direction too: every recorded endpoint must still be
    // declared somewhere in the tree, so a deletion cannot be hidden by a stale count.
    const currentKeys = new Set(extractApiSurface(ROOT).map((r) => `${r.method} ${r.path}`));
    for (const endpoint of previous.endpoints) {
      expect(currentKeys.has(endpoint), `snapshot endpoint no longer exists: ${endpoint}`).toBe(true);
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
