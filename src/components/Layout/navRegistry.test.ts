/**
 * G16 - the layouts' menus are derived, and every menu entry is renderable.
 *
 * Before P5.3b each layout held its own `navItems` array naming every path a second time, while
 * the feature-gate map named them a third time. Three lists keyed by the same strings: a typo in
 * any one produced a menu entry that navigated nowhere, or a page no menu could reach, and
 * nothing failed.
 *
 * The menus are derived from the route table now. What can still go wrong is an icon: the icon
 * table is keyed by path, so a route that gains a label without gaining an icon renders a
 * fallback glyph instead of failing. This ratchet makes that a test failure, and pins the menu
 * sizes so a route silently losing its label is noticed.
 */

import { describe, expect, it } from 'vitest';

import { adminNavEntries, navEntries, pathsMissingIcons } from '@/components/Layout/navRegistry';

/** Menu sizes as they were before the menus became derived, per layout. */
const EXPECTED_MENU_SIZE: Record<string, number> = {
  '/teacher': 25,
  '/student': 22,
  '/parent': 6,
};

describe('G16 derived menus', () => {
  for (const [layoutPath, expected] of Object.entries(EXPECTED_MENU_SIZE)) {
    it(`${layoutPath} has ${expected} menu entries`, () => {
      expect(navEntries(layoutPath)).toHaveLength(expected);
    });

    it(`${layoutPath} has an icon for every menu entry`, () => {
      const missing = pathsMissingIcons(layoutPath);
      expect(
        missing,
        `menu paths with a label but no icon: ${missing.join(', ')}. ` +
          'Add them to ICONS in navRegistry.ts, or the entry renders a fallback glyph.',
      ).toEqual([]);
    });

    it(`${layoutPath} entries all have a path and a label`, () => {
      const problems = navEntries(layoutPath)
        .filter((entry) => !entry.path.startsWith(layoutPath) || entry.label.trim() === '')
        .map((entry) => `${entry.path} (label: "${entry.label}")`);
      expect(problems, `malformed menu entries: ${problems.join(', ')}`).toEqual([]);
    });
  }

  it('menu paths are unique within a layout', () => {
    // A duplicate would render two entries pointing at the same page.
    for (const layoutPath of Object.keys(EXPECTED_MENU_SIZE)) {
      const paths = navEntries(layoutPath).map((entry) => entry.path);
      const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
      expect(duplicates, `${layoutPath} has duplicate menu paths: ${duplicates.join(', ')}`).toEqual([]);
    }
  });

  /**
   * The admin menu is looked up by layout module, not by path, because the admin path is injected
   * at runtime. These assertions matter more than the others for that reason: an icon table keyed
   * on the resolved path would pass here (the test default is `/beiadmin`) and fail on every
   * deployment that renamed it.
   */
  it('the admin menu is found regardless of the configured path', () => {
    expect(adminNavEntries()).toHaveLength(10);
    expect(adminNavEntries().map((entry) => entry.label)).toEqual([
      '系统仪表盘',
      '公告管理',
      '文章管理',
      '网站设置',
      '教师管理',
      '激活码管理',
      '系统设置',
      '开发者与校园',
      '审计日志',
      '系统重置',
    ]);
  });

  it('every admin menu entry has an icon', () => {
    const missing = adminNavEntries().filter((entry) => typeof entry.icon === 'symbol');
    expect(missing.map((entry) => entry.path), 'admin menu entries without an icon').toEqual([]);
  });
});
