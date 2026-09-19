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
import { flatRoutes, layoutRoutes, referencedPageModules } from '@/app/routing/routeTable';

describe('route table', () => {
  it('keeps the route count the JSX tree had', () => {
    // 80 <Route> elements: 9 flat, 4 layouts, 67 children (28 teacher, 23 student, 6 parent, 10 admin).
    expect(flatRoutes).toHaveLength(9);
    expect(layoutRoutes).toHaveLength(4);
    const children = layoutRoutes.reduce((total, layout) => total + layout.children.length, 0);
    expect(children).toBe(67);
    expect(flatRoutes.length + layoutRoutes.length + children).toBe(80);
  });

  it('keeps every layout path', () => {
    expect(layoutRoutes.map((layout) => layout.path)).toEqual([
      '/teacher',
      '/student',
      '/parent',
      '/beiadmin',
    ]);
  });

  it('keeps the teacher child paths', () => {
    const teacher = layoutRoutes.find((layout) => layout.path === '/teacher')!;
    expect(teacher.children.map((child) => child.path)).toEqual([
      '',
      'records',
      'add-student',
      'shop',
      'auction',
      'task-tree',
      'brawl',
      'territory',
      'features',
      'bigscreen',
      'analysis',
      'communication',
      'lucky-draw-config',
      'tools',
      'verification',
      'assignments',
      'exams',
      'papers',
      'papers/:id/edit',
      'knowledge',
      'attendance',
      'world-boss',
      'economy',
      'blind-box',
      'pets',
      'team-quests',
      'certificates',
      'settings',
    ]);
  });

  it('keeps the student child paths, including the parameterised ones', () => {
    const student = layoutRoutes.find((layout) => layout.path === '/student')!;
    expect(student.children.map((child) => child.path)).toEqual([
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
      'papers',
      'papers/:id',
      'wrong-questions',
      'plan',
      'assignments',
      'team-quests',
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
    ]);

    const admin = layoutRoutes.find((layout) => layout.path === '/beiadmin')!;
    expect(admin.children.map((child) => child.path)).toEqual([
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
    ]);
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
    const gated = layoutRoutes
      .flatMap((layout) => layout.children)
      .filter((child) => child.feature)
      .map((child) => child.path);

    // The four student flags that are gated by a route, plus the parent one.
    expect(gated).toEqual([
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
      'tasks',
    ]);
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
