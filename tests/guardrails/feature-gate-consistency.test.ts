/**
 * G20 - one route, one feature requirement.
 *
 * The route table says which flag opens a page (`feature.requirement`) and
 * `src/lib/featureRoutes.ts` says the same thing a second time, for the callers that only have a
 * path (`StudentLayout`'s redirect, `getFirstEnabledRoute`). Two declarations of one fact is exactly
 * the shape that drifts, and it did:
 *
 *   - `/student/challenge` was `{ key: 'enable_challenge' }` in the route table while
 *     `studentFeatureRequirements` said `anyOf: ['enable_challenge', 'enable_world_boss']`, and the
 *     server gates the two modes separately. A class with only the world boss switched on lost the
 *     menu entry *and* the page, while the two other consumers believed the page was reachable.
 *   - `enable_world_boss` appeared in `classFeatureRouteMap` without gating anything.
 *
 * This file compares the two, key by key, for every student and parent route. It is not a ratchet:
 * there is no acceptable number of disagreements.
 */

import { describe, expect, it } from 'vitest';

import { layoutRoutes } from '@/app/routing/routeTable';
import { parentFeatureRequirements, studentFeatureRequirements } from '@/lib/featureRoutes';

/** `{ key }` and `{ anyOf }` are the same requirement written differently; normalise to compare. */
function normalise(requirement: { key?: string; anyOf?: string[] } | undefined): string[] | null {
  if (!requirement) return null;
  if ('anyOf' in requirement && requirement.anyOf) return [...requirement.anyOf].sort();
  return requirement.key ? [requirement.key] : null;
}

/** The full path of each gated route under one console layout. */
function gatedRoutes(layoutPath: string): Array<{ path: string; requirement: string[] | null }> {
  const layout = layoutRoutes().find((entry) => entry.path === layoutPath);
  expect(layout, `${layoutPath} layout is missing`).toBeTruthy();
  return (layout?.children ?? [])
    .filter((child) => child.feature)
    .map((child) => ({
      path: `/${layoutPath.replace(/^\//, '')}/${child.path}`.replace(/\/$/, ''),
      requirement: normalise(child.feature?.requirement as { key?: string; anyOf?: string[] }),
    }));
}

describe('G20: the route table and featureRoutes agree about every gated route', () => {
  it('student routes', () => {
    const routes = gatedRoutes('/student');
    const declared = studentFeatureRequirements as Record<string, { key?: string; anyOf?: string[] }>;

    for (const route of routes) {
      expect(declared[route.path], `${route.path} is gated in the route table but absent from studentFeatureRequirements`).toBeTruthy();
      expect(
        normalise(declared[route.path]),
        `${route.path}: the route table and studentFeatureRequirements disagree`,
      ).toEqual(route.requirement);
    }

    // And the other direction: a requirement for a path no route carries is dead configuration.
    for (const path of Object.keys(declared)) {
      expect(
        routes.some((route) => route.path === path),
        `${path} has a feature requirement but no gated route`,
      ).toBe(true);
    }
  });

  it('parent routes', () => {
    const routes = gatedRoutes('/parent');
    const declared = parentFeatureRequirements as Record<string, { key?: string; anyOf?: string[] }>;

    for (const route of routes) {
      expect(declared[route.path], `${route.path} is gated in the route table but absent from parentFeatureRequirements`).toBeTruthy();
      expect(normalise(declared[route.path]), `${route.path}: the route table and parentFeatureRequirements disagree`).toEqual(
        route.requirement,
      );
    }

    for (const path of Object.keys(declared)) {
      expect(routes.some((route) => route.path === path), `${path} has a feature requirement but no gated route`).toBe(true);
    }
  });
});
