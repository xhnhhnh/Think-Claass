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

import { adminPath } from '@/constants';

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
  /**
   * Menu label, for routes that appear in their layout's navigation.
   *
   * The layouts used to each keep their own `navItems` array naming the same paths, so a route
   * and its menu entry were declared in two files and a typo in either produced a menu entry
   * that navigated nowhere. Here, `label` present means "show this in the menu", which makes the
   * route table the single source for path, feature gate AND menu membership.
   *
   * Routes without a label still work; they are simply not reachable from the menu (the
   * parameterised pages, and the pages that duplicate another entry's target).
   */
  label?: string;
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
];

/**
 * Layout routes that are not tied to the deployment's admin path.
 *
 * The admin routes are built separately (see `layoutRoutes()`) because their path comes from
 * the server at runtime - baking it in here is what forced a deploy-time `sed` rewrite of the
 * built bundle.
 */
const roleLayoutRoutes: LayoutRoute[] = [
  {
    path: '/teacher',
    layout: '@/components/Layout/TeacherLayout',
    allowedRoles: ['teacher', 'superadmin'],
    children: [
      // Listed in menu order: the label marks a route as a menu entry, so this array also
      // defines the sidebar. Routes without a label (index, `add-student`, `papers/:id/edit`,
      // `task-tree`) are reachable but not linked from the menu, exactly as before.
      { path: '', component: '@/features/classroom/pages/TeacherDashboardPage', label: '班级与学生管理' },
      { path: 'attendance', component: '@/pages/Teacher/Attendance', label: '考勤与请假' },
      { path: 'assignments', component: '@/features/learning/pages/TeacherAssignmentsPage', label: '作业管理' },
      { path: 'exams', component: '@/features/learning/pages/TeacherExamsPage', label: '考试与成绩' },
      { path: 'papers', component: '@/features/learning/pages/TeacherPapersPage', label: '试卷系统' },
      { path: 'knowledge', component: '@/features/learning/pages/TeacherKnowledgeGraphPage', label: '知识点图谱' },
      { path: 'team-quests', component: '@/features/collaboration/pages/TeacherTeamQuestsPage', label: '团队任务' },
      { path: 'pets', component: '@/features/pet/pages/TeacherPetsPage', label: '精灵管理' },
      { path: 'brawl', component: '@/features/battles/pages/TeacherBrawlPage', label: '跨班大乱斗' },
      { path: 'territory', component: '@/features/slg/pages/TeacherTerritoryPage', label: '领土扩张' },
      { path: 'records', component: '@/features/classroom/pages/TeacherRecordsPage', label: '积分与兑换记录' },
      { path: 'certificates', component: '@/features/engagement/pages/TeacherCertificatesPage', label: '荣誉奖状' },
      { path: 'shop', component: '@/features/marketplace/pages/TeacherShopPage', label: '商品管理' },
      { path: 'economy', component: '@/features/economy/pages/TeacherEconomyPage', label: '股票管理' },
      { path: 'auction', component: '@/features/marketplace/pages/TeacherAuctionPage', label: '拍卖行管理' },
      { path: 'blind-box', component: '@/features/marketplace/pages/TeacherBlindBoxPage', label: '盲盒管理' },
      { path: 'features', component: '@/pages/Teacher/Features', label: '功能开关' },
      { path: 'world-boss', component: '@/features/challenge/pages/TeacherWorldBossPage', label: '世界BOSS管理' },
      { path: 'lucky-draw-config', component: '@/features/engagement/pages/TeacherLuckyDrawConfigPage', label: '抽奖设置' },
      { path: 'verification', component: '@/pages/Teacher/Verification', label: '奖品核销' },
      { path: 'communication', component: '@/features/engagement/pages/TeacherCommunicationPage', label: '家校与留言' },
      { path: 'analysis', component: '@/pages/Teacher/Analysis', label: '数据分析' },
      { path: 'tools', component: '@/features/classroom/pages/TeacherToolsPage', label: '教学工具' },
      { path: 'bigscreen', component: '@/features/classroom/pages/TeacherBigscreenPage', label: '大屏展示' },
      { path: 'settings', component: '@/features/classroom/pages/TeacherSettingsPage', label: '个人设置' },
      // Reachable, not in the menu.
      { path: 'add-student', component: '@/features/classroom/pages/TeacherAddStudentPage' },
      { path: 'task-tree', component: '@/features/collaboration/pages/TeacherTaskTreePage' },
      { path: 'papers/:id/edit', component: '@/features/learning/pages/TeacherPaperEditorPage' },
    ],
  },
  {
    path: '/student',
    layout: '@/components/Layout/StudentLayout',
    allowedRoles: ['student'],
    children: [
      { path: 'pet', component: '@/features/pet/pages/StudentPetPage', label: '我的精灵' },
      { path: 'shop', component: '@/features/marketplace/pages/StudentShopPage', feature: { requirement: { key: 'enable_shop' }, title: '积分商城', role: 'student' }, label: '积分商城' },
      { path: 'auction', component: '@/features/marketplace/pages/StudentAuctionPage', feature: { requirement: { key: 'enable_auction_blind_box' }, title: '拍卖行', role: 'student' }, label: '拍卖行' },
      { path: 'challenge', component: '@/features/challenge/pages/StudentChallengePage', feature: { requirement: { key: 'enable_challenge' }, title: '挑战模式', role: 'student' }, label: '挑战模式' },
      { path: 'lucky-draw', component: '@/features/engagement/pages/StudentLuckyDrawPage', feature: { requirement: { key: 'enable_lucky_draw' }, title: '翻牌抽奖', role: 'student' }, label: '翻牌抽奖' },
      { path: 'my-redemptions', component: '@/features/engagement/pages/StudentMyRedemptionsPage', label: '我的兑换' },
      { path: 'certificates', component: '@/features/engagement/pages/StudentCertificatesPage', label: '荣誉奖状' },
      { path: 'achievements', component: '@/features/classroom/pages/StudentAchievementsPage', feature: { requirement: { key: 'enable_achievements' }, title: '成就墙', role: 'student' }, label: '成就墙' },
      { path: 'interactive-wall', component: '@/features/engagement/pages/StudentInteractiveWallPage', feature: { requirement: { anyOf: ['enable_chat_bubble', 'enable_tree_hole'] }, title: '互动墙', role: 'student' }, label: '互动墙' },
      { path: 'peer-review', component: '@/features/engagement/pages/StudentPeerReviewPage', feature: { requirement: { key: 'enable_peer_review' }, title: '同伴互评', role: 'student' }, label: '同伴互评' },
      { path: 'dungeon', component: '@/features/dungeon/pages/StudentDungeonPage', feature: { requirement: { key: 'enable_dungeon' }, title: '无尽塔', role: 'student' }, label: '无尽塔' },
      { path: 'brawl', component: '@/features/battles/pages/StudentBrawlPage', feature: { requirement: { key: 'enable_class_brawl' }, title: '大乱斗', role: 'student' }, label: '大乱斗' },
      { path: 'gacha', component: '@/features/gacha/pages/StudentGachaPage', feature: { requirement: { key: 'enable_gacha' }, title: '召唤法阵', role: 'student' }, label: '召唤法阵' },
      { path: 'task-tree', component: '@/features/collaboration/pages/StudentTaskTreePage', feature: { requirement: { key: 'enable_task_tree' }, title: '技能树', role: 'student' }, label: '技能树' },
      { path: 'territory', component: '@/features/slg/pages/StudentTerritoryPage', feature: { requirement: { key: 'enable_slg' }, title: '版图', role: 'student' }, label: '版图' },
      { path: 'bank', component: '@/features/economy/pages/StudentBankPage', feature: { requirement: { key: 'enable_economy' }, title: '银行股市', role: 'student' }, label: '银行股市' },
      { path: 'guild-pk', component: '@/features/classroom/pages/StudentGuildPKPage', feature: { requirement: { key: 'enable_guild_pk' }, title: '公会PK', role: 'student' }, label: '公会PK' },
      { path: 'assignments', component: '@/features/learning/pages/StudentAssignmentsPage', label: '学业中心' },
      { path: 'team-quests', component: '@/features/collaboration/pages/StudentTeamQuestsPage', label: '团队任务' },
      { path: 'papers', component: '@/features/learning/pages/StudentPapersPage', label: '试卷练习' },
      { path: 'wrong-questions', component: '@/features/learning/pages/StudentWrongQuestionsPage', label: '错题本' },
      { path: 'plan', component: '@/features/learning/pages/StudentPlanPage', label: '学习计划' },
      // Not in the menu: reached by navigating to a specific paper.
      { path: 'papers/:id', component: '@/features/learning/pages/StudentPaperAttemptPage' },
    ],
  },
  {
    path: '/parent',
    layout: '@/components/Layout/ParentLayout',
    allowedRoles: ['parent'],
    children: [
      { path: 'dashboard', component: '@/pages/Parent/Dashboard', label: '温馨家园' },
      { path: 'communication', component: '@/features/engagement/pages/ParentCommunicationPage', label: '家校信箱' },
      { path: 'report', component: '@/pages/Parent/Report', label: '成长足迹' },
      { path: 'tasks', component: '@/pages/Parent/Tasks', feature: { requirement: { key: 'enable_family_tasks' }, title: '家庭时光', role: 'parent' }, label: '家庭时光' },
      { path: 'leave-request', component: '@/pages/Parent/LeaveRequest', label: '请假假条' },
      { path: 'assignments', component: '@/pages/Parent/Assignments', label: '学习采撷' },
    ],
  },
];

/**
 * Route table as data.
 *
 * `layoutRoutes()` and `flatRoutesWithAdmin()` are functions rather than constants because the
 * admin path is injected by the server at runtime (`window.__TC_CONFIG__.adminPath`). A
 * module-level constant would freeze it at import time, before the config is guaranteed to be
 * present, and would put the deployment path back in the built bundle.
 */
export function layoutRoutes(): LayoutRoute[] {
  return [
    ...roleLayoutRoutes,
    {
      path: adminPath(),
      layout: '@/components/Layout/AdminLayout',
      allowedRoles: ['admin', 'superadmin'],
      children: [
        // In menu order, like every other layout: a label marks a menu entry.
        { path: '', component: '@/pages/Admin/Dashboard', label: '系统仪表盘' },
        { path: 'announcements', component: '@/features/admin/pages/AdminAnnouncementsPage', label: '公告管理' },
        { path: 'articles', component: '@/features/admin/pages/AdminArticlesPage', label: '文章管理' },
        { path: 'website', component: '@/features/admin/pages/AdminWebsitePage', label: '网站设置' },
        { path: 'teachers', component: '@/features/admin/pages/AdminTeachersPage', label: '教师管理' },
        { path: 'codes', component: '@/features/admin/pages/AdminCodesPage', label: '激活码管理' },
        { path: 'settings', component: '@/pages/Admin/Settings', label: '系统设置' },
        { path: 'openapi', component: '@/features/admin/pages/AdminOpenApiPage', label: '开发者与校园' },
        { path: 'audit-logs', component: '@/features/admin/pages/AdminAuditLogsPage', label: '审计日志' },
        { path: 'reset', component: '@/pages/Admin/SystemReset', label: '系统重置' },
      ],
    },
  ];
}

/** Flat routes plus the admin login route, whose path is also deployment-dependent. */
export function flatRoutesWithAdmin(): PageRoute[] {
  return [...flatRoutes, { path: `${adminPath()}/login`, component: '@/pages/Admin/Login' }];
}

/** Every page module the table references, for the load-time existence check. */
export function referencedPageModules(): string[] {
  const paths = new Set<string>();
  for (const route of flatRoutesWithAdmin()) paths.add(route.component);
  for (const layout of layoutRoutes()) {
    paths.add(layout.layout);
    for (const child of layout.children) paths.add(child.component);
  }
  return [...paths];
}

export { isLayout };
