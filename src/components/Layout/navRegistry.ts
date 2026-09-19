/**
 * Layout navigation, derived from the route table.
 *
 * Each layout used to keep its own `navItems` array naming every path a second time:
 *
 *     const allNavItems = [
 *       { path: '/student/pet', icon: Star, label: '我的精灵' },
 *       { path: '/student/shop', icon: ShoppingBag, label: '积分商城' },
 *       ...
 *
 * while `studentFeatureRequirements` - the gate that decides whether each entry is *shown* -
 * named the same paths a third time. Three lists keyed by the same strings, with a typo in any
 * one producing a menu entry that navigates nowhere or a page that can never be reached.
 *
 * Now the route table carries the label and the gate, and this module joins them with the icons.
 * Icons stay here because they are presentation, not routing - the route layer has no business
 * knowing that `/student/bank` uses a building glyph.
 */

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Award,
  BarChart,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle,
  CheckSquare,
  ClipboardList,
  Crosshair,
  FileSpreadsheet,
  FileText,
  Gift,
  GitBranch,
  Globe,
  Gavel,
  Home,
  Key,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Map,
  MapPin,
  Medal,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquareHeart,
  MonitorPlay,
  Network,
  Package,
  PieChart,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Store,
  Swords,
  Target,
  Ticket,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';

import { layoutRoutes } from '@/app/routing/routeTable';
import type { ClassFeatures } from '@/lib/classFeatures.generated';
import { isFeatureRequirementEnabled, type FeatureRequirement } from '@/lib/featureRoutes';

/** Icon per menu path. A path with a label but no icon is a missing entry, not a silent default. */
const ICONS: Record<string, LucideIcon> = {
  // Keyed by the route table's path (`/<layout>/<child>`), so an index child is `/<layout>/`.
  '/teacher/': Users,
  '/teacher/attendance': CalendarCheck,
  '/teacher/assignments': BookOpen,
  '/teacher/exams': FileSpreadsheet,
  '/teacher/papers': FileText,
  '/teacher/knowledge': Network,
  '/teacher/team-quests': Target,
  '/teacher/pets': Sparkles,
  '/teacher/brawl': Swords,
  '/teacher/territory': Map,
  '/teacher/records': ClipboardList,
  '/teacher/certificates': Award,
  '/teacher/shop': Store,
  '/teacher/economy': Landmark,
  '/teacher/auction': Gavel,
  '/teacher/blind-box': Package,
  '/teacher/features': Settings,
  '/teacher/world-boss': ShieldAlert,
  '/teacher/lucky-draw-config': Gift,
  '/teacher/verification': CheckCircle,
  '/teacher/communication': MessageCircle,
  '/teacher/analysis': BarChart,
  '/teacher/tools': Wrench,
  '/teacher/bigscreen': MonitorPlay,
  '/teacher/settings': UserCog,
  '/student/pet': Star,
  '/student/shop': ShoppingBag,
  '/student/auction': Gavel,
  '/student/challenge': Swords,
  '/student/lucky-draw': Gift,
  '/student/my-redemptions': Ticket,
  '/student/certificates': Award,
  '/student/achievements': Medal,
  '/student/interactive-wall': MessageSquare,
  '/student/peer-review': MessageSquareHeart,
  '/student/dungeon': Skull,
  '/student/brawl': Crosshair,
  '/student/gacha': Sparkles,
  '/student/task-tree': GitBranch,
  '/student/territory': MapPin,
  '/student/bank': Building2,
  '/student/guild-pk': Swords,
  '/student/assignments': BookOpen,
  '/student/team-quests': Users,
  '/student/papers': FileText,
  '/student/wrong-questions': ListChecks,
  '/student/plan': ListChecks,
  '/parent/dashboard': Home,
  '/parent/communication': MessageSquare,
  '/parent/report': PieChart,
  '/parent/tasks': CheckSquare,
  '/parent/leave-request': Calendar,
  '/parent/assignments': BookOpen,
  // Admin. Keyed by the route table's own path, not the resolved one: the admin path is injected
  // at runtime, so a lookup keyed on `/beiadmin` would miss on every deployment that renamed it.
  '/beiadmin/': LayoutDashboard,
  '/beiadmin/announcements': Megaphone,
  '/beiadmin/articles': FileText,
  '/beiadmin/website': Globe,
  '/beiadmin/teachers': Users,
  '/beiadmin/codes': Key,
  '/beiadmin/settings': Settings,
  '/beiadmin/openapi': Server,
  '/beiadmin/audit-logs': Shield,
  '/beiadmin/reset': AlertTriangle,
};

/** A menu path that has a label in the route table but no icon here. */
export const MISSING_ICON = Symbol('missing-icon');

export interface NavEntry {
  path: string;
  label: string;
  /** The declared icon, or `MISSING_ICON` for a menu path the icon table does not cover. */
  icon: LucideIcon | typeof MISSING_ICON;
  requirement?: FeatureRequirement;
}

/** Fallback so a missing icon renders instead of crashing; the guardrail suite checks the table. */
const FALLBACK_ICON: LucideIcon = FileText;

/** A nav entry whose icon is guaranteed to be a component. */
export interface ResolvedNavEntry extends Omit<NavEntry, 'icon'> {
  icon: LucideIcon;
}

/**
 * Every labelled route under `layoutPath`, in route-table order, with its gate.
 *
 * Route-table order is the menu order by design: the entries are listed in the order the menu
 * should show them. Before, the menu had its own order that differed from the route list, which
 * is one more thing that could drift.
 */
export function navEntries(layoutPath: string): NavEntry[] {
  const layout = layoutRoutes().find((route) => route.path === layoutPath);
  if (!layout) return [];

  const entries: NavEntry[] = [];
  for (const child of layout.children) {
    if (!child.label) continue;
    const path = child.path === '' ? layoutPath : `${layoutPath}/${child.path}`;
    // Icons are keyed by the route table's own path (`/<layout>/<child>`), which is stable even
    // when the resolved path is runtime-varying - as the admin path is.
    const iconKey = `${layoutPath}/${child.path}`;
    entries.push({
      path,
      label: child.label,
      icon: ICONS[iconKey] ?? MISSING_ICON,
      ...(child.feature ? { requirement: child.feature.requirement } : {}),
    });
  }
  return entries;
}

/** The menu, with declared icons resolved and entries the class features turned off removed. */
export function visibleNavItems(layoutPath: string, features: ClassFeatures): ResolvedNavEntry[] {
  return navEntries(layoutPath)
    .filter((entry) => isFeatureRequirementEnabled(features, entry.requirement))
    .map((entry) => ({
      ...entry,
      icon: (entry.icon === MISSING_ICON ? FALLBACK_ICON : entry.icon) as LucideIcon,
    }));
}

/** The label for a path, used for the shell title. */
export function navLabel(layoutPath: string, path: string): string | undefined {
  return navEntries(layoutPath).find((entry) => entry.path === path)?.label;
}

/** Menu paths for a layout whose icon table entry is missing. Used by the guardrail suite. */
export function pathsMissingIcons(layoutPath: string): string[] {
  return navEntries(layoutPath)
    .filter((entry) => entry.icon === MISSING_ICON)
    .map((entry) => entry.path);
}

/** Resolve an entry's icon for rendering. */
export function iconFor(entry: NavEntry): LucideIcon {
  return (entry.icon === MISSING_ICON ? FALLBACK_ICON : entry.icon) as LucideIcon;
}

/**
 * The admin menu.
 *
 * Found by layout module rather than by path, because the admin path is injected at runtime and
 * this file cannot know what it is. That is also why the icon table keys admin entries on the
 * route table's path (`/beiadmin/...`) rather than on the resolved one.
 */
export function adminNavEntries(): NavEntry[] {
  const admin = layoutRoutes().find((route) => route.layout.endsWith('/AdminLayout'));
  return admin ? navEntries(admin.path) : [];
}
