import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { adminPath } from '@/constants';

import { layoutRoutes, navGroupsFor, type LayoutMode, type NavGroup } from '@/app/routing/routeTable';
import { matchNavItem, navItems } from '@/app/nav/navRegistry';
import type { Crumb } from '@/components/ui/breadcrumb';

/**
 * Where the current URL sits in the console.
 *
 * One hook, because four consumers need the same four facts and each of them used to
 * work it out separately:
 *
 *   - the context bar needs the title and the breadcrumb trail;
 *   - the rail needs to know which destination is current;
 *   - the dock needs the same, at a different breakpoint;
 *   - the shell needs the layout mode, to decide whether to draw any chrome at all.
 *
 * The previous shell did all of it inline in each layout with `pathname === item.path`,
 * so a parameterised route produced no active entry, no breadcrumb and a hard-coded
 * title. Deriving the four facts in one place is what makes them agree. There is one
 * hook rather than four so that the facts cannot disagree.
 */

export interface PageMeta {
  /** The nav destination this URL belongs to, if it is a destination at all. */
  item?: { path: string; label: string; group?: string };
  /** The heading for the context bar. Never empty: falls back to the console's own name. */
  title: string;
  /** Whether the shell draws its chrome around this page. */
  mode: LayoutMode;
  /** Trail for the context bar: section › first entry of the section › this page. */
  breadcrumbs: Crumb[];
  /** The rail sections declared for this console, in order. */
  groups: NavGroup[];
  /** The console's own path prefix, or `null` on the public surface. */
  layoutPath: string | null;
}

/**
 * Which console a pathname belongs to.
 *
 * The admin console is resolved through `adminPath()` because its prefix is injected by
 * the server per deployment; matching on a build-time constant is the defect that left a
 * renamed deployment's rail empty.
 */
export function layoutPathFor(pathname: string): string | null {
  if (pathname.startsWith('/teacher')) return '/teacher';
  if (pathname.startsWith('/student')) return '/student';
  if (pathname.startsWith('/parent')) return '/parent';

  const admin = adminPath();
  if (admin && admin !== '/' && pathname.startsWith(admin)) {
    return layoutRoutes().find((route) => route.layout.endsWith('/AdminLayout'))?.path ?? null;
  }
  return null;
}

/** The layout module declared for a path prefix, used to identify the admin console. */
function layoutModuleFor(layoutPath: string): string | undefined {
  return layoutRoutes().find((route) => route.path === layoutPath)?.layout;
}

/** The table entry for a concrete pathname under a console, if one matches exactly. */
function exactChild(layoutPath: string, pathname: string) {
  return layoutRoutes()
    .find((route) => route.path === layoutPath)
    ?.children.find(
      (candidate) =>
        (candidate.path === '' ? layoutPath : `${layoutPath}/${candidate.path}`) === pathname,
    );
}

export function usePageMeta(fallbackTitle: string, fallbackMode: LayoutMode = 'workbench'): PageMeta {
  const { pathname } = useLocation();

  return useMemo(() => {
    const layoutPath = layoutPathFor(pathname);

    if (!layoutPath) {
      return {
        title: fallbackTitle,
        mode: fallbackMode,
        breadcrumbs: [],
        groups: [],
        layoutPath: null,
      };
    }

    const item = matchNavItem(layoutPath, pathname);
    const groups = navGroupsFor(layoutPath, layoutModuleFor(layoutPath));

    const group = item?.group ? groups.find((candidate) => candidate.key === item.group) : undefined;

    /*
     * The trail is built from the destinations that exist, not from the URL. A
     * parameterised page (`papers/:id/edit`) has no label of its own, so its trail
     * stops at the section and its first entry rather than inventing a crumb out of a
     * numeric id - "试卷系统 › 编辑" is useful, "12 › 编辑" is not.
     */
    const sectionAnchors = item?.group
      ? navItems(layoutPath).filter((candidate) => candidate.group === item.group)
      : [];
    const firstOfSection = sectionAnchors[0];

    const breadcrumbs: Crumb[] = [
      ...(group ? [{ label: group.label }] : []),
      ...(firstOfSection && item && firstOfSection.path !== item.path
        ? [{ label: firstOfSection.label, to: firstOfSection.path }]
        : []),
      ...(item ? [{ label: item.label }] : []),
    ];

    return {
      item: item
        ? { path: item.path, label: item.label, ...(item.group ? { group: item.group } : {}) }
        : undefined,
      title: item?.label ?? fallbackTitle,
      mode: exactChild(layoutPath, pathname)?.mode ?? fallbackMode,
      breadcrumbs,
      groups,
      layoutPath,
    };
  }, [fallbackMode, fallbackTitle, pathname]);
}
