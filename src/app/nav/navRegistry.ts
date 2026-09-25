import { FileText, type LucideIcon } from 'lucide-react';

import {
  layoutRoutes,
  navGroupsFor,
  type LayoutRoute,
  type NavGroup,
  type PageRoute,
} from '@/app/routing/routeTable';
import type { ClassFeatures } from '@/lib/classFeatures.generated';
import { isFeatureRequirementEnabled, type FeatureRequirement } from '@/lib/featureRoutes';

/**
 * Navigation, derived from the route table.
 *
 * ## What this replaced
 *
 * A `navRegistry.ts` under `src/components/Layout/` that kept a second table keyed by
 * the same path strings as the route table, joined at render time, plus a
 * `MISSING_ICON` sentinel and a `pathsMissingIcons()` helper for the guardrail that
 * watched the two drift apart. The icon is a field on the route now, so the sentinel,
 * the fallback swap, the helper and its guardrail have no subject left and are gone.
 *
 * What remains is the part that genuinely has to be computed: which destinations a
 * role can see right now given the class feature flags, and how a URL maps back to the
 * destination that is "current".
 *
 * ## Why the active matcher is not `pathname === item.path`
 *
 * The previous shell compared the pathname to each path with `===`. On every
 * parameterised route - `/teacher/papers/:id/edit`, `/student/papers/:id` - nothing
 * matched, so no rail entry highlighted and the shell fell back to a hard-coded title.
 * The matcher below splits a path into literal and parameter segments and compares
 * them segment by segment, and it is the single definition of "which destination am I
 * on" for the rail, the dock, the context bar and the page title.
 *
 * The tie-break matters too: `/student/papers/7` matches both `papers/:id` and, by
 * shape, `papers`. The more specific pattern wins, so candidates are ordered by
 * descending literal-segment count before the first match is taken.
 */

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  mobileTab?: number;
  requirement?: FeatureRequirement;
}

export interface NavSection {
  key: string;
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
}

/**
 * The icon used when a labelled route forgot to declare one.
 *
 * Intentional rather than defensive: a guardrail fails the build on this case, and
 * "the build fails, and the menu still renders" is a better failure than a rail full
 * of blank squares. It is the same file glyph the old registry used as its fallback.
 */
const FALLBACK_ICON: LucideIcon = FileText;

/** The layout entry for a path, or the admin entry when `layoutPath` is the admin path. */
function findLayout(layoutPath: string): LayoutRoute | undefined {
  return layoutRoutes().find((route) => route.path === layoutPath);
}

/**
 * The rail sections declared for a layout.
 *
 * Asks the table rather than deciding here, so the admin console - whose path is
 * deployment-defined - is recognised by its layout module instead of by a path that
 * does not exist at build time.
 */
function groupsFor(layoutPath: string): NavGroup[] {
  return navGroupsFor(layoutPath, findLayout(layoutPath)?.layout);
}

/** Split a route path (or a pathname) into segments, ignoring leading/trailing slashes. */
function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Does a route pattern match a concrete pathname? A parameter segment matches one segment. */
export function matchesRoute(pattern: string, pathname: string): boolean {
  const patternSegments = segments(pattern);
  const pathSegments = segments(pathname);

  // A trailing `*` is not used by the current table, but the table is data and a
  // catch-all is the one pattern a reserved area (the admin console) would want.
  if (patternSegments[patternSegments.length - 1] === '*') {
    const fixed = patternSegments.slice(0, -1);
    return fixed.every((segment, index) => matchesSegment(segment, pathSegments[index]));
  }

  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every((segment, index) => matchesSegment(segment, pathSegments[index]));
}

function matchesSegment(patternSegment: string, pathSegment: string | undefined): boolean {
  if (pathSegment === undefined) return false;
  if (patternSegment.startsWith(':')) return pathSegment.length > 0;
  return patternSegment === pathSegment;
}

function countLiterals(path: string): number {
  return segments(path).filter((segment) => !segment.startsWith(':')).length;
}

/** Resolve a child route's absolute path under its layout. */
function absolutePath(layoutPath: string, child: PageRoute): string {
  return child.path === '' ? layoutPath : `${layoutPath}/${child.path}`;
}

/**
 * Every labelled destination of a layout, in route-table order, with its gate.
 *
 * A route without a label is not a destination - an editor, a detail view, a
 * redirect target - and is reachable without appearing in any menu.
 */
export function navItems(layoutPath: string): NavItem[] {
  const layout = findLayout(layoutPath);
  if (!layout) return [];

  const items: NavItem[] = [];
  for (const child of layout.children) {
    if (!child.label) continue;
    items.push({
      path: absolutePath(layoutPath, child),
      label: child.label,
      icon: child.icon ?? FALLBACK_ICON,
      ...(child.group ? { group: child.group } : {}),
      ...(child.mobileTab !== undefined ? { mobileTab: child.mobileTab } : {}),
      ...(child.feature ? { requirement: child.feature.requirement } : {}),
    });
  }
  return items;
}

/**
 * Destinations a layout can currently show, given the class feature flags.
 *
 * `hidden` is the console's own extra suppression, for the rules that cannot live on a
 * route: the teacher console hides an entry whose *menu usefulness* depends on any of six
 * student-facing flags while the route itself stays reachable. Applying it here rather
 * than at each call site is what keeps the rail, the dock and the command palette in
 * agreement - a destination hidden from the rail but offered by the palette is a command
 * that navigates to a page the reader was told they do not have.
 */
export function visibleNavItems(
  layoutPath: string,
  features: ClassFeatures,
  hidden?: ReadonlySet<string>,
): NavItem[] {
  return navItems(layoutPath).filter((item) => {
    if (hidden?.has(item.path)) return false;
    return isFeatureRequirementEnabled(features, item.requirement);
  });
}

/**
 * Destinations grouped into rail sections, in the declared group order.
 *
 * A destination in no known group lands in a trailing section rather than
 * disappearing, so adding a route without a group is a misplacement rather than a
 * bug you find on a phone.
 */
export function navSections(
  layoutPath: string,
  features: ClassFeatures,
  groups: NavGroup[] = groupsFor(layoutPath),
  hidden?: ReadonlySet<string>,
): NavSection[] {
  const visible = visibleNavItems(layoutPath, features, hidden);

  const sections: NavSection[] = groups.map((group) => ({
    key: group.key,
    label: group.label,
    ...(group.icon ? { icon: group.icon } : {}),
    items: visible.filter((item) => item.group === group.key),
  }));

  const grouped = new Set(sections.flatMap((section) => section.items.map((item) => item.path)));
  const ungrouped = visible.filter((item) => !grouped.has(item.path));
  if (ungrouped.length > 0) {
    sections.push({ key: '__other', label: '更多功能', items: ungrouped });
  }

  // Empty sections are dropped. On a class where every gameplay flag is off, an
  // empty 「游戏化玩法」 heading is noise that says something is missing without
  // saying what.
  return sections.filter((section) => section.items.length > 0);
}

/** The dock's destinations: the lowest `mobileTab` positions, ordered. */
export function mobileTabs(
  layoutPath: string,
  features: ClassFeatures,
  limit = 4,
  hidden?: ReadonlySet<string>,
): NavItem[] {
  return visibleNavItems(layoutPath, features, hidden)
    .filter((item) => item.mobileTab !== undefined)
    .sort((a, b) => (a.mobileTab ?? Number.MAX_SAFE_INTEGER) - (b.mobileTab ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit);
}

/** Everything the dock does not show, in rail order. The 「更多」 sheet renders this. */
export function mobileOverflow(
  layoutPath: string,
  features: ClassFeatures,
  limit = 4,
  hidden?: ReadonlySet<string>,
): NavItem[] {
  const tabs = new Set(mobileTabs(layoutPath, features, limit, hidden).map((item) => item.path));
  return visibleNavItems(layoutPath, features, hidden).filter((item) => !tabs.has(item.path));
}

/**
 * The destination a pathname belongs to, or `undefined` for a page that is not a
 * destination.
 *
 * Candidates are ordered so the most specific pattern wins: `/student/papers/7`
 * resolves to `papers/:id` rather than `papers`.
 */
export function matchNavItem(layoutPath: string, pathname: string): NavItem | undefined {
  return navItems(layoutPath)
    .filter((item) => matchesRoute(item.path, pathname))
    .sort((a, b) => countLiterals(b.path) - countLiterals(a.path))[0];
}

/**
 * The page's own title for a pathname, or `undefined` when the page is not a
 * destination.
 *
 * The caller decides the fallback, because the honest fallback differs: a rail entry
 * for a detail view is the rail's own label, while the admin console's unlabelled
 * pages fall back to the console's name.
 */
export function titleFor(layoutPath: string, pathname: string): string | undefined {
  return matchNavItem(layoutPath, pathname)?.label;
}

/** The rail sections declared for a layout, before feature flags are applied. */
export function navGroupDefinitions(layoutPath: string): NavGroup[] {
  return groupsFor(layoutPath);
}
