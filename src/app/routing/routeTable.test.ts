/**
 * Route table integrity.
 *
 * The route table replaced an 80-element JSX tree, and the app's existing tests never render
 * that tree - they test pages directly. So a dropped route, a mistyped path or a dead module
 * reference would ship silently: the page would simply 404 for users, and nothing would fail.
 *
 * This test is the guard for that. It pins the shape of the table (so dropping a route is a
 * failure, not a diff nobody reads), checks every referenced module resolves through the page
 * map, and checks the feature-gated routes match the catalogue the frontend gates on.
 */

import { describe, expect, it } from 'vitest';

import { pageModules } from '@/app/routing/pageModules';
import {
  flatRoutesWithAdmin,
  layoutRoutes as layoutRoutesFn,
  referencedPageModules,
} from '@/app/routing/routeTable';

describe('route table', () => {
  // The table is built per call because the admin path is injected at runtime, so these are
  // computed once here for comparison.
  const flatRoutes = flatRoutesWithAdmin();
  const layoutRoutes = layoutRoutesFn();

  it('keeps the route count the JSX tree had', () => {
    // 80 <Route> elements in the JSX tree this table replaced: 9 flat, 4 layouts, 67 children
    // (28 teacher, 23 student, 6 parent, 10 admin). The opening-guide round added three more
    // children - `settings` for the student and the parent areas and `profile` for the console -
    // because a route table that gives only some roles a settings page is what made
    // 「重新开始引导」 unreachable for the others. Teacher kept its existing `settings` path.
    //
    // The homework round added five, all of them new screens rather than aliases: the teacher list
    // and its grade sheet, plus the student list, attempt page and result page. The two legacy
    // `assignments` routes are *kept* - as unlabelled aliases of the new homework pages, so old
    // bookmarks and the mobile dock still land somewhere - which is why the total grew by five
    // rather than shrinking by the two pages that were deleted. 71 -> 76 children, 84 -> 89 routes.
    //
    // The AI 智学 round added three more: the teacher board, the student's set page and the student's
    // answering screen. 76 -> 79 children, 89 -> 92 routes.
    const children = layoutRoutes.reduce((total, layout) => total + layout.children.length, 0);
    expect(children).toBe(79);
    expect(flatRoutes.length + layoutRoutes.length + children).toBe(92);
  });

  it('keeps every layout path', () => {
    expect(layoutRoutes.map((layout) => layout.path)).toEqual([
      '/teacher',
      '/student',
      '/parent',
      '/beiadmin',
    ]);
  });

  /**
   * The contracts pinned here are the route *set* and which routes are menu entries - not the
   * declaration order within the array.
   *
   * Order became meaningful in P5.3b: a labelled route is a menu entry, and the array order is the
   * menu order. But that is a presentation decision the layout owns, and asserting it here would
   * make every menu reordering fail a routing test. What must not change silently is dropping a
   * route or losing a label, so those are what these check.
   */
  it('keeps every teacher child path', () => {
    const teacher = layoutRoutes.find((layout) => layout.path === '/teacher')!;
    expect([...teacher.children.map((child) => child.path)].sort()).toEqual(
      [
        '',
        'add-student',
        'ai-study',
        'analysis',
        'assignments',
        'attendance',
        'auction',
        'bigscreen',
        'blind-box',
        'brawl',
        'certificates',
        'communication',
        'economy',
        'exams',
        'features',
        'homework',
        'homework/:id/grade',
        'knowledge',
        'lucky-draw-config',
        'papers',
        'papers/:id/edit',
        'pets',
        'records',
        'settings',
        'shop',
        'task-tree',
        'team-quests',
        'territory',
        'tools',
        'verification',
        'world-boss',
      ].sort(),
    );
  });

  it('labels exactly the teacher routes that appear in the menu', () => {
    const teacher = layoutRoutes.find((layout) => layout.path === '/teacher')!;
    const labelled = teacher.children.filter((child) => child.label).map((child) => child.path);
    const unlabelled = teacher.children.filter((child) => !child.label).map((child) => child.path);

    // 25 menu entries, matching the old hand-written navItems array. 作业管理 moved from
    // `/teacher/assignments` to `/teacher/homework`, which keeps the count and the dock slot: the
    // legacy path is still routed, but as an unlabelled alias of the same page.
    expect(labelled).toHaveLength(26);
    // Reachable but not linked, exactly as before - plus `assignments` (the alias) and the grade
    // sheet, which is opened from a row on the homework list.
    expect([...unlabelled].sort()).toEqual(['add-student', 'assignments', 'homework/:id/grade', 'papers/:id/edit', 'task-tree']);
  });

  it('keeps the student child paths, including the parameterised ones', () => {
    const student = layoutRoutes.find((layout) => layout.path === '/student')!;
    expect([...student.children.map((child) => child.path)].sort()).toEqual(
      [
        '',
        'pet',
        'shop',
        'auction',
        'task-tree',
        'brawl',
        'territory',
        'gacha',
        'bank',
        'dungeon',
        'challenge',
        'lucky-draw',
        'my-redemptions',
        'certificates',
        'achievements',
        'interactive-wall',
        'peer-review',
        'guild-pk',
        'homework',
        'homework/:id',
        'homework/:id/result',
        'papers',
        'papers/:id',
        'wrong-questions',
        'plan',
        'ai-study',
        'ai-study/:id',
        'assignments',
        'team-quests',
        'settings',
      ].sort(),
    );
  });

  it('labels exactly the student routes that appear in the menu', () => {
    const student = layoutRoutes.find((layout) => layout.path === '/student')!;
    const labelled = student.children.filter((child) => child.label).map((child) => child.path);

    // 24 menu entries include the growth overview. 我的作业 took the slot `/student/assignments` held,
    // so the count is unchanged; the legacy path stays routed as an unlabelled alias.
    expect(labelled).toHaveLength(25);
    // Sorted on both sides: this compares the *set*, and the array order is the menu order, which
    // the layout owns - an assertion on it would make a menu reordering fail a routing test.
    expect([...student.children.filter((child) => !child.label).map((child) => child.path)].sort()).toEqual([
      'ai-study/:id',
      'assignments',
      'homework/:id',
      'homework/:id/result',
      'papers/:id',
    ]);
  });

  it('keeps the parent and admin child paths', () => {
    const parent = layoutRoutes.find((layout) => layout.path === '/parent')!;
    expect(parent.children.map((child) => child.path)).toEqual([
      'dashboard',
      'communication',
      'report',
      'tasks',
      'leave-request',
      'assignments',
      'settings',
    ]);

    const admin = layoutRoutes.find((layout) => layout.path === '/beiadmin')!;
    // Compared as a set: the order is the admin menu's, and it differs from the route list's.
    expect([...admin.children.map((child) => child.path)].sort()).toEqual(
      [
        '',
        'announcements',
        'articles',
        'website',
        'audit-logs',
        'teachers',
        'settings',
        'codes',
        'openapi',
        'reset',
        'profile',
      ].sort(),
    );
  });

  it('every referenced module resolves through the page map', () => {
    // `assertRoutesResolve` runs at module load and would have thrown already; asserting it
    // here as well means the failure names this test rather than an import side effect.
    const missing = referencedPageModules().filter((modulePath) => typeof pageModules[modulePath] !== 'function');
    expect(missing, `route table references modules that do not exist: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not pull test files into the route chunks', () => {
    const testEntries = Object.keys(pageModules).filter((key) => key.includes('.test.'));
    expect(testEntries, `test modules must not be route chunks: ${testEntries.join(', ')}`).toEqual([]);
  });

  it('gates exactly the routes the feature catalogue declares', () => {
    // Compared as a set: the route order is now menu order, which is a presentation concern.
    const gated = layoutRoutes
      .flatMap((layout) => layout.children)
      .filter((child) => child.feature)
      .map((child) => child.path)
      .sort();

    // 15 student flags gated by a route, plus the parent one.
    expect(gated).toEqual(
      [
        'shop',
        'auction',
        'task-tree',
        'brawl',
        'territory',
        'gacha',
        'bank',
        'dungeon',
        'challenge',
        'lucky-draw',
        'achievements',
        'interactive-wall',
        'peer-review',
        'guild-pk',
        'ai-study',
        'tasks',
      ].sort(),
    );
  });

  it('every gated route names a flag the catalogue declares', () => {
    // Uses the generated catalogue indirectly: the route table's type is keyed on
    // ClassFeatureKey, so an unknown flag is a compile error. This catches the case where the
    // requirement is built from an array, which the type cannot narrow.
    const anyOfFlags = layoutRoutes
      .flatMap((layout) => layout.children)
      .flatMap((child) => (child.feature && 'anyOf' in child.feature.requirement ? child.feature.requirement.anyOf : []));

    expect(anyOfFlags).toEqual(['enable_chat_bubble', 'enable_tree_hole']);
  });
});
