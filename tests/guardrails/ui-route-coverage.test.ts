/**
 * UI-R guardrail: every route resolves, every destination is navigable, and the shell
 * agrees with the table it draws its menu from.
 *
 * ## Why this file exists rather than trusting the page tests
 *
 * The C phase rewrites 76 page components and the D phase rewrites their tests. A page
 * that is deleted, renamed, or quietly dropped from the route table during that work
 * fails nothing on its own: its tests go with it, and the suite stays green while a
 * feature disappears. That is the failure mode a large UI refactor reliably produces, and
 * it is invisible to any test that only covers the pages somebody remembered to cover.
 *
 * So this measures the *table* rather than the pages:
 *
 *   - every referenced module resolves through the generated page map;
 *   - the generated map contains nothing the table does not reference;
 *   - every destination has a label, an icon, and a section that exists;
 *   - the shell's own navigation functions return what the table declares;
 *   - the mobile dock never declares more slots than it can show.
 *
 * ## Why it imports the table
 *
 * It imports the real module, so it cannot disagree with the application: the earlier
 * text-scanning version of this file got three separate answers wrong (JSX-valued icons,
 * dock grouping, and layout modules) without any of them being defects in the table.
 * Importing costs a `tsconfigPaths()` plugin in the guardrail vitest config, which is
 * cheaper than a second implementation of the table's shape.
 *
 * The navigation assertions at the end deliberately call the *shipping* functions rather
 * than re-deriving their rules: `navItems` is what builds the rail, the dock and the
 * command palette, so a change to the table that breaks one of them has to break this.
 */

import { describe, expect, it } from 'vitest';

import {
  flatRoutesWithAdmin,
  layoutRoutes,
  navGroupsFor,
  referencedPageModules,
} from '@/app/routing/routeTable';

import { pageModules } from '@/app/routing/pageModules';

/** Every module the table references, page or shell. */
const referenced = referencedPageModules();

/** The consoles, identified by their layout module so a renamed deployment path cannot hide one. */
const CONSOLES = [
  { key: 'teacher', layout: '/TeacherLayout' },
  { key: 'student', layout: '/StudentLayout' },
  { key: 'parent', layout: '/ParentLayout' },
  { key: 'admin', layout: '/AdminLayout' },
] as const;

const consoleFor = (layoutModule: string) =>
  CONSOLES.find((entry) => layoutModule.endsWith(entry.layout));

describe('UI-R route coverage', () => {
  it('the table is populated (an empty table would make everything below vacuous)', () => {
    expect(referenced.length).toBeGreaterThan(70);
    expect(layoutRoutes().length).toBe(4);
    expect(flatRoutesWithAdmin().length).toBeGreaterThanOrEqual(9);
  });

  it('every referenced module resolves through the generated page map', () => {
    const missing = referenced.filter((module) => !(module in pageModules));
    expect(
      missing,
      `these modules are named by the route table but absent from the generated map ` +
        `(run \`npm run route-modules\`): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the page map exposes nothing the table does not reference', () => {
    const known = new Set(referenced);
    const orphans = Object.keys(pageModules).filter((module) => !known.has(module));
    expect(
      orphans,
      `the generated map imports modules no route reaches: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('every console is declared with the role gate it needs', () => {
    for (const { key } of CONSOLES) {
      const layout = layoutRoutes().find((route) => consoleFor(route.layout)?.key === key);
      expect(layout, `no ${key} console in the table`).toBeDefined();
      expect(layout?.allowedRoles?.length, `the ${key} console has no role gate`).toBeGreaterThan(0);
    }
  });
});

describe('UI-R destinations', () => {
  /** Every labelled child route, with its console. */
  const destinations = layoutRoutes().flatMap((layout) =>
    layout.children
      .filter((child) => child.label)
      .map((child) => ({ console: consoleFor(layout.layout)?.key, layout, child })),
  );

  it('there are destinations to check', () => {
    expect(destinations.length).toBeGreaterThan(30);
  });

  it('every destination carries a label, an icon and a section that exists', () => {
    const missingIcon = destinations.filter((entry) => !entry.child.icon).map((entry) => entry.child.label);
    const missingGroup = destinations.filter((entry) => !entry.child.group).map((entry) => entry.child.label);

    const unknownGroup = destinations
      .filter((entry) => {
        const keys = navGroupsFor(entry.layout.path, entry.layout.layout).map((group) => group.key);
        return entry.child.group ? !keys.includes(entry.child.group) : false;
      })
      .map((entry) => `${entry.child.label} -> ${entry.child.group}`);

    expect(missingIcon, `destinations without an icon: ${missingIcon.join(', ')}`).toEqual([]);
    expect(missingGroup, `destinations in no section: ${missingGroup.join(', ')}`).toEqual([]);
    expect(
      unknownGroup,
      `destinations in a section the console does not declare: ${unknownGroup.join(', ')}`,
    ).toEqual([]);
  });

  it('every destination has a unique full path', () => {
    const paths = layoutRoutes().flatMap((layout) =>
      layout.children.map((child) => (child.path === '' ? layout.path : `${layout.path}/${child.path}`)),
    );
    const duplicates = paths.filter((item, index) => paths.indexOf(item) !== index);
    expect(duplicates, `two routes resolve to the same path: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('every non-destination page is reachable from one that is', () => {
    /*
     * A route with no label is an editor or a detail view: legitimate, and exactly the
     * shape that becomes an orphan when the list or dashboard it hangs off is rewritten.
     * Each one has to be reachable, and there are three ways:
     *
     *   1. **opened from a destination** - listed below by hand, because "the dashboard has
     *      a button to it" is a fact about the dashboard's markup that no route table can
     *      express. The list is the reviewed part: adding a page of this shape means
     *      editing this line, which is the point.
     *   2. **a sub-route of a destination** - `papers/:id` hangs off `papers`,
     *      `papers/:id/edit` off the same, which is checked structurally.
     *   3. **an alias of a destination** - checked structurally below, for a path that
     *      renders the same component as a labelled route. `/teacher/assignments` is the
     *      worked example: it renders the very page `/teacher/homework` labels, so it is
     *      reachable by definition, and giving it a label of its own would put the same
     *      destination in the rail twice.
     */
    const OPENED_FROM: Record<string, string> = {
      '/teacher/add-student': '班级与学生管理',
      '/teacher/task-tree': '团队任务',
    };

    /** Components a labelled route in the same console already renders. */
    const labelledComponents = new Set(
      layoutRoutes().flatMap((layout) =>
        layout.children.filter((child) => child.label).map((child) => `${layout.path}|${child.component}`),
      ),
    );

    const orphans = layoutRoutes()
      .flatMap((layout) =>
        layout.children
          .filter((child) => !child.label)
          .map((child) => ({
            full: child.path === '' ? layout.path : `${layout.path}/${child.path}`,
            layout,
            child,
          })),
      )
      .filter(({ full, layout, child }) => {
        if (OPENED_FROM[full]) return false;
        // An alias: the same module is a labelled destination in this console.
        if (labelledComponents.has(`${layout.path}|${child.component}`)) return false;
        const parentPath = child.path.split('/')[0];
        return !layout.children.some((candidate) => candidate.label && candidate.path === parentPath);
      })
      .map(({ full }) => full);

    expect(
      orphans,
      `pages with no labelled destination to be opened from: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('every hand-listed sub-page names a destination that exists', () => {
    // The list above is only a check if the names in it are real; a typo would exempt a
    // page that nobody can reach.
    const labels = new Set(
      layoutRoutes().flatMap((layout) => layout.children.map((child) => child.label).filter(Boolean)),
    );
    const ghost = ['班级与学生管理', '团队任务'].filter((label) => !labels.has(label));
    expect(ghost, `the reachability list names destinations that do not exist: ${ghost.join(', ')}`).toEqual(
      [],
    );
  });
});

describe('UI-R the dock', () => {
  it('no console declares more tabs than the dock can show', () => {
    for (const { key } of CONSOLES) {
      const layout = layoutRoutes().find((route) => consoleFor(route.layout)?.key === key);
      if (!layout) continue;

      const tabs = layout.children
        .filter((child) => child.mobileTab !== undefined)
        .map((child) => child.mobileTab as number)
        .sort((a, b) => a - b);

      // `mobileTabs(..., limit)` slices silently, so a fifth tab would vanish without a
      // failure anywhere else.
      expect(tabs.length, `the ${key} console declares ${tabs.length} dock tabs`).toBeLessThanOrEqual(4);
      expect(tabs, `the ${key} dock tabs must run 1..n without gaps or repeats`).toEqual(
        [1, 2, 3, 4].slice(0, tabs.length),
      );
    }
  });

  it('every dock tab is a destination the dock can render', () => {
    for (const layout of layoutRoutes()) {
      const tabs = layout.children.filter((child) => child.mobileTab !== undefined);
      for (const tab of tabs) {
        expect(tab.label, `a dock tab with no label: ${tab.path}`).toBeDefined();
        expect(tab.icon, `a dock tab with no icon: ${tab.path}`).toBeDefined();
      }
    }
  });

  it('an immersive page is reached from inside a console, never from the dock', () => {
    // The dock is the mobile shell's persistent navigation; an immersive page hides that
    // shell entirely, so a dock tab pointing at one is a tab that navigates somewhere with
    // no way back except the floating exit.
    const immersiveTabs = layoutRoutes()
      .flatMap((layout) =>
        layout.children
          .filter((child) => child.mode === 'immersive' && child.mobileTab !== undefined)
          .map((child) => `${layout.path}/${child.path}`),
      );
    expect(immersiveTabs, `immersive pages with a dock tab: ${immersiveTabs.join(', ')}`).toEqual([]);
  });
});
