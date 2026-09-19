/**
 * The route table.
 *
 * This is the 80-element `<Route>` JSX tree from `AppRoutes.tsx`, expressed as data. The
 * shape is the same information - path, role gate, layout, feature gate - minus the JSX, and
 * page components are referenced by their module path so the route layer does not import
 * plugin code (guardrail G4).
 *
 * Why data rather than JSX: a route table that *names* plugin modules cannot have a plugin
 * added or removed without editing core, which is the property this phase exists to change.
 * Once the table is data it can be filtered by what the server reports as installed, and
 * feature gating becomes one field instead of a hand-wrapped `<FeatureRouteGuard>` per route.
 *
 * The table is asserted against the page-module map at module load (see `assertRoutesResolve`),
 * so a path typo fails immediately rather than blanking one page in production.
 */

import { ADMIN_PATH } from '@/constants';

import type { ClassFeatureKey } from '@/lib/classFeatures.generated';

/** One flag, or any one of several - matching `FeatureRequirement` in featureRoutes.ts. */
export type RouteFeatureRequirement =
  | { key: ClassFeatureKey }
  | { anyOf: ClassFeatureKey[] };

export interface PageRoute {
  /** Path relative to the parent layout, or absolute for a flat route. */
  path: string;
  /** Module path of the page component, e.g. `@/features/economy/pages/StudentBankPage`. */
  component: string;
  /** Present when the page is gated on a class feature flag. */
  feature?: { requirement: RouteFeatureRequirement; title: string; role: 'student' | 'parent' };
}

export interface LayoutRoute {
  path: string;
  /** Module path of the layout component. */
  layout: string;
  /** Role gate applied to the layout; absent means the layout is not role-restricted. */
  allowedRoles?: string[];
  children: PageRoute[];
}

export type RouteTableEntry = PageRoute | LayoutRoute;

const isLayout = (entry: RouteTableEntry): entry is LayoutRoute => 'layout' in entry;

/**
 * Flat routes: no layout, no role gate.
 *
 * `component` paths here are page modules that happen to sit in the legacy `src/pages` tree.
 * They are still resolved through the same map, so moving one into a plugin later is a
 * one-line change here.
 */
export const flatRoutes: PageRoute[] = [
  { path: '/', component: '@/features/portal/pages/HomePage' },
  { path: '/login', component: '@/features/auth/pages/LoginPage' },
  { path: '/activate', component: '@/features/auth/pages/ActivatePage' },
  { path: '/payment', component: '@/pages/Payment' },
  { path: '/about', component: '@/features/portal/pages/AboutPage' },
  { path: '/contact', component: '@/features/portal/pages/ContactPage' },
  { path: '/news', component: '@/features/portal/pages/NewsPage' },
  { path: '/services', component: '@/features/portal/pages/ServicesPage' },
  { path: `${ADMIN_PATH}/login`, component: '@/pages/Admin/Login' },
];

/** Layout routes: each wraps its children in a layout behind a role gate. */
export const layoutRoutes: LayoutRoute[] = [
  {
    path: '/teacher',
    layout: '@/components/Layout/TeacherLayout',
    allowedRoles: ['teacher', 'superadmin'],
    children: [
      { path: '', component: '@/features/classroom/pages/TeacherDashboardPage' },
      { path: 'records', component: '@/features/classroom/pages/TeacherRecordsPage' },
      { path: 'add-student', component: '@/features/classroom/pages/TeacherAddStudentPage' },
      { path: 'shop', component: '@/features/marketplace/pages/TeacherShopPage' },
      { path: 'auction', component: '@/features/marketplace/pages/TeacherAuctionPage' },
      { path: 'task-tree', component: '@/features/collaboration/pages/TeacherTaskTreePage' },
      { path: 'brawl', component: '@/features/battles/pages/TeacherBrawlPage' },
      { path: 'territory', component: '@/features/slg/pages/TeacherTerritoryPage' },
      { path: 'features', component: '@/pages/Teacher/Features' },
      { path: 'bigscreen', component: '@/features/classroom/pages/TeacherBigscreenPage' },
      { path: 'analysis', component: '@/pages/Teacher/Analysis' },
      { path: 'communication', component: '@/features/engagement/pages/TeacherCommunicationPage' },
      { path: 'lucky-draw-config', component: '@/features/engagement/pages/TeacherLuckyDrawConfigPage' },
      { path: 'tools', component: '@/features/classroom/pages/TeacherToolsPage' },
      { path: 'verification', component: '@/pages/Teacher/Verification' },
      { path: 'assignments', component: '@/features/learning/pages/TeacherAssignmentsPage' },
      { path: 'exams', component: '@/features/learning/pages/TeacherExamsPage' },
      { path: 'papers', component: '@/features/learning/pages/TeacherPapersPage' },
      { path: 'papers/:id/edit', component: '@/features/learning/pages/TeacherPaperEditorPage' },
      { path: 'knowledge', component: '@/features/learning/pages/TeacherKnowledgeGraphPage' },
      { path: 'attendance', component: '@/pages/Teacher/Attendance' },
      { path: 'world-boss', component: '@/features/challenge/pages/TeacherWorldBossPage' },
      { path: 'economy', component: '@/features/economy/pages/TeacherEconomyPage' },
      { path: 'blind-box', component: '@/features/marketplace/pages/TeacherBlindBoxPage' },
      { path: 'pets', component: '@/features/pet/pages/TeacherPetsPage' },
      { path: 'team-quests', component: '@/features/collaboration/pages/TeacherTeamQuestsPage' },
      { path: 'certificates', component: '@/features/engagement/pages/TeacherCertificatesPage' },
      { path: 'settings', component: '@/features/classroom/pages/TeacherSettingsPage' },
    ],
  },
  {
    path: '/student',
    layout: '@/components/Layout/StudentLayout',
    allowedRoles: ['student'],
    children: [
      { path: 'pet', component: '@/features/pet/pages/StudentPetPage' },
      { path: 'shop', component: '@/features/marketplace/pages/StudentShopPage', feature: { requirement: { key: 'enable_shop' }, title: '积分商城', role: 'student' } },
      { path: 'auction', component: '@/features/marketplace/pages/StudentAuctionPage', feature: { requirement: { key: 'enable_auction_blind_box' }, title: '拍卖行', role: 'student' } },
      { path: 'task-tree', component: '@/features/collaboration/pages/StudentTaskTreePage', feature: { requirement: { key: 'enable_task_tree' }, title: '技能树', role: 'student' } },
      { path: 'brawl', component: '@/features/battles/pages/StudentBrawlPage', feature: { requirement: { key: 'enable_class_brawl' }, title: '大乱斗', role: 'student' } },
      { path: 'territory', component: '@/features/slg/pages/StudentTerritoryPage', feature: { requirement: { key: 'enable_slg' }, title: '版图', role: 'student' } },
      { path: 'gacha', component: '@/features/gacha/pages/StudentGachaPage', feature: { requirement: { key: 'enable_gacha' }, title: '召唤法阵', role: 'student' } },
      { path: 'bank', component: '@/features/economy/pages/StudentBankPage', feature: { requirement: { key: 'enable_economy' }, title: '银行股市', role: 'student' } },
      { path: 'dungeon', component: '@/features/dungeon/pages/StudentDungeonPage', feature: { requirement: { key: 'enable_dungeon' }, title: '无尽塔', role: 'student' } },
      { path: 'challenge', component: '@/features/challenge/pages/StudentChallengePage', feature: { requirement: { key: 'enable_challenge' }, title: '挑战模式', role: 'student' } },
      { path: 'lucky-draw', component: '@/features/engagement/pages/StudentLuckyDrawPage', feature: { requirement: { key: 'enable_lucky_draw' }, title: '翻牌抽奖', role: 'student' } },
      { path: 'my-redemptions', component: '@/features/engagement/pages/StudentMyRedemptionsPage' },
      { path: 'certificates', component: '@/features/engagement/pages/StudentCertificatesPage' },
      { path: 'achievements', component: '@/features/classroom/pages/StudentAchievementsPage', feature: { requirement: { key: 'enable_achievements' }, title: '成就墙', role: 'student' } },
      { path: 'interactive-wall', component: '@/features/engagement/pages/StudentInteractiveWallPage', feature: { requirement: { anyOf: ['enable_chat_bubble', 'enable_tree_hole'] }, title: '互动墙', role: 'student' } },
      { path: 'peer-review', component: '@/features/engagement/pages/StudentPeerReviewPage', feature: { requirement: { key: 'enable_peer_review' }, title: '同伴互评', role: 'student' } },
      { path: 'guild-pk', component: '@/features/classroom/pages/StudentGuildPKPage', feature: { requirement: { key: 'enable_guild_pk' }, title: '公会PK', role: 'student' } },
      { path: 'papers', component: '@/features/learning/pages/StudentPapersPage' },
      { path: 'papers/:id', component: '@/features/learning/pages/StudentPaperAttemptPage' },
      { path: 'wrong-questions', component: '@/features/learning/pages/StudentWrongQuestionsPage' },
      { path: 'plan', component: '@/features/learning/pages/StudentPlanPage' },
      { path: 'assignments', component: '@/features/learning/pages/StudentAssignmentsPage' },
      { path: 'team-quests', component: '@/features/collaboration/pages/StudentTeamQuestsPage' },
    ],
  },
  {
    path: '/parent',
    layout: '@/components/Layout/ParentLayout',
    allowedRoles: ['parent'],
    children: [
      { path: 'dashboard', component: '@/pages/Parent/Dashboard' },
      { path: 'communication', component: '@/features/engagement/pages/ParentCommunicationPage' },
      { path: 'report', component: '@/pages/Parent/Report' },
      { path: 'tasks', component: '@/pages/Parent/Tasks', feature: { requirement: { key: 'enable_family_tasks' }, title: '家庭时光', role: 'parent' } },
      { path: 'leave-request', component: '@/pages/Parent/LeaveRequest' },
      { path: 'assignments', component: '@/pages/Parent/Assignments' },
    ],
  },
  {
    path: ADMIN_PATH,
    layout: '@/components/Layout/AdminLayout',
    allowedRoles: ['admin', 'superadmin'],
    children: [
      { path: '', component: '@/pages/Admin/Dashboard' },
      { path: 'announcements', component: '@/features/admin/pages/AdminAnnouncementsPage' },
      { path: 'articles', component: '@/features/admin/pages/AdminArticlesPage' },
      { path: 'website', component: '@/features/admin/pages/AdminWebsitePage' },
      { path: 'audit-logs', component: '@/features/admin/pages/AdminAuditLogsPage' },
      { path: 'teachers', component: '@/features/admin/pages/AdminTeachersPage' },
      { path: 'settings', component: '@/pages/Admin/Settings' },
      { path: 'codes', component: '@/features/admin/pages/AdminCodesPage' },
      { path: 'openapi', component: '@/features/admin/pages/AdminOpenApiPage' },
      { path: 'reset', component: '@/pages/Admin/SystemReset' },
    ],
  },
];

/** Every page module the table references, for the load-time existence check. */
export function referencedPageModules(): string[] {
  const paths = new Set<string>();
  for (const route of flatRoutes) paths.add(route.component);
  for (const layout of layoutRoutes) {
    paths.add(layout.layout);
    for (const child of layout.children) paths.add(child.component);
  }
  return [...paths];
}

export { isLayout };
