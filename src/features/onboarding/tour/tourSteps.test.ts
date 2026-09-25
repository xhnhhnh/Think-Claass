import { describe, expect, it } from 'vitest';

import { adminPath } from '@/constants';
import { navItems } from '@/app/nav/navRegistry';

import { FEATURE_COPY, featureCopyKey } from './featureCatalogue';
import {
  guideLayoutPath,
  guideRole,
  navAnchor,
  tourStepsFor,
  type GuideRole,
  type TourStep,
} from './tourSteps';

/**
 * The tour's step lists.
 *
 * These assertions are about the *shape* of a tour, not its wording: the copy is free to change,
 * but a step with no anchor points at nothing, a step with an unknown action is never finished, and
 * a tour whose last step has no 「完成」 cannot be left except by skipping. Every one of those is a
 * broken tour that would still render.
 */

const ROLES: GuideRole[] = ['teacher', 'student', 'parent', 'admin'];

const ALL_STEPS: TourStep[] = [
  ...tourStepsFor('teacher', { hasClass: true }),
  ...tourStepsFor('teacher', { hasClass: false }),
  ...tourStepsFor('student', { hasClass: true }),
  ...tourStepsFor('parent', { hasClass: true }),
  ...tourStepsFor('admin', { hasClass: true }),
];

const ACTIONS = new Set(['next', 'click', 'input', 'hover', 'select', 'drag']);

describe('every tour', () => {
  it('has steps', () => {
    for (const role of ROLES) {
      expect(tourStepsFor(role, { hasClass: true }).length, `${role} has no steps`).toBeGreaterThan(3);
    }
  });

  it('anchors every step to an element', () => {
    // An unanchored step can only be shown centred, which is the fallback path - it should never be
    // how a step is written, only what happens when its target is missing.
    const unanchored = ALL_STEPS.filter((step) => step.anchor === null).map((step) => step.id);
    expect(unanchored, 'steps with no anchor').toEqual([]);
  });

  it('gives every step a title, a description and a known action', () => {
    for (const step of ALL_STEPS) {
      expect(step.title.trim(), `${step.id} has no title`).not.toBe('');
      expect(step.description.trim(), `${step.id} has no description`).not.toBe('');
      expect(ACTIONS.has(step.action), `${step.id} has an unknown action: ${step.action}`).toBe(true);
    }
  });

  it('ends on a step that can be completed', () => {
    for (const role of ROLES) {
      const steps = tourStepsFor(role, { hasClass: true });
      expect(steps[steps.length - 1].primaryLabel, `${role}'s last step cannot be completed`).toBe('完成');
    }
  });

  it('gives every step fallback copy', () => {
    // A step whose target is not on screen shows `fallback`; without one the reader is left reading
    // a description of a control that is not in front of them, with nothing to say where it went.
    const missing = ALL_STEPS.filter((step) => !step.fallback).map((step) => step.id);
    expect(missing, 'steps with no fallback copy').toEqual([]);
  });

  it('uses unique step ids within a tour', () => {
    for (const role of ROLES) {
      const ids = tourStepsFor(role, { hasClass: true }).map((step) => step.id);
      expect(new Set(ids).size, `${role} has duplicate step ids`).toBe(ids.length);
    }
  });
});

describe('the two teacher tours', () => {
  it('differs, because the two screens do not share a single control', () => {
    const withClass = tourStepsFor('teacher', { hasClass: true }).map((step) => step.anchor);
    const withoutClass = tourStepsFor('teacher', { hasClass: false }).map((step) => step.anchor);

    expect(withClass).not.toEqual(withoutClass);
    expect(withoutClass).toContain('firstrun-class-name');
    expect(withClass).not.toContain('firstrun-class-name');
  });

  it('only the tour without a class teaches the wizard', () => {
    const withoutClass = tourStepsFor('teacher', { hasClass: false }).map((step) => step.anchor);
    expect(withoutClass.filter((anchor) => anchor?.startsWith('firstrun-')).length).toBeGreaterThan(1);

    const withClass = tourStepsFor('teacher', { hasClass: true }).map((step) => step.anchor);
    expect(withClass.filter((anchor) => anchor?.startsWith('firstrun-'))).toEqual([]);
  });
});

describe('navAnchor', () => {
  it('builds the attribute value the shell actually writes', () => {
    // `CampusShell` writes `data-tour={`nav:${item.path}`}`; this is the same string from the other
    // side, so a step cannot disagree with the menu about how a path is spelled.
    expect(navAnchor('/teacher/features')).toBe('nav:/teacher/features');
  });
});

describe('the admin tour', () => {
  it('reads its paths from the runtime config like the route table does', () => {
    const anchors = tourStepsFor('admin', { hasClass: true })
      .map((step) => step.anchor)
      .filter((anchor): anchor is string => anchor !== null && anchor.startsWith('nav:'));

    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      // The console's own index route is exactly the base path, so a trailing separator is not
      // required - what matters is that no step points outside the injected console path.
      const underBase =
        anchor === navAnchor(adminPath()) || anchor.startsWith(`nav:${adminPath()}/`);
      expect(underBase, `${anchor} is not under the admin path`).toBe(true);
    }
  });
});

/**
 * Total coverage.
 *
 * The complaint this closes: the written-by-hand tour explained six of a teacher's twenty-five
 * features. Generated steps fixed that for today; these assertions are what keep it fixed, because
 * the failure mode was never "somebody deleted a step" - it was "somebody added a menu entry and the
 * tour silently did not mention it".
 */
describe('feature coverage', () => {
  it('describes every menu entry of every layout', () => {
    const missing: string[] = [];

    for (const role of ROLES) {
      const layoutPath = guideLayoutPath(role);
      for (const entry of navItems(layoutPath)) {
        const childPath = entry.path === layoutPath ? '' : entry.path.slice(layoutPath.length + 1);
        if (!FEATURE_COPY[featureCopyKey(role, childPath)]) {
          missing.push(`${role}:${childPath || '(index)'}`);
        }
      }
    }

    expect(missing, 'menu entries with no line of guidance').toEqual([]);
  });

  it('gives every menu entry a step in its role’s tour', () => {
    for (const role of ROLES) {
      const layoutPath = guideLayoutPath(role);
      const anchors = new Set(tourStepsFor(role, { hasClass: true }).map((step) => step.anchor));
      const uncovered = navItems(layoutPath)
        .map((entry) => entry.path)
        .filter((path) => !anchors.has(navAnchor(path)));

      expect(uncovered, `${role} has features with no step`).toEqual([]);
    }
  });

  it('covers the menu even for a teacher with no class yet', () => {
    // The two teacher tours differ only in their core steps; the feature half is the same, which is
    // exactly the guarantee that a brand-new teacher is not shown fewer features than an old one.
    const layoutPath = guideLayoutPath('teacher');
    const anchors = new Set(
      tourStepsFor('teacher', { hasClass: false }).map((step) => step.anchor),
    );

    const uncovered = navItems(layoutPath)
      .map((entry) => entry.path)
      .filter((path) => !anchors.has(navAnchor(path)));

    expect(uncovered).toEqual([]);
  });
});

describe('guideRole', () => {
  it('maps the four roles the tour speaks to', () => {
    expect(guideRole('teacher')).toBe('teacher');
    expect(guideRole('student')).toBe('student');
    expect(guideRole('parent')).toBe('parent');
  });

  it('folds superadmin into the console tour', () => {
    expect(guideRole('superadmin')).toBe('admin');
    expect(guideRole('admin')).toBe('admin');
  });

  it('answers null for an account it has no tour for', () => {
    expect(guideRole(undefined)).toBeNull();
    expect(guideRole('')).toBeNull();
    expect(guideRole('visitor')).toBeNull();
  });
});
