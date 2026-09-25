/**
 * The route table, and the navigation that belongs to it.
 *
 * This is the 80-element `<Route>` tree from the old `AppRoutes.tsx`, expressed as
 * data, plus everything the shell needs to draw a menu: path, label, icon, group,
 * feature gate, layout mode and — for a phone — which four destinations earn a place
 * in the bottom dock.
 *
 * ## Why the icons live here now
 *
 * They used to live in `src/components/Layout/navRegistry.ts`, a second module keyed
 * by the same path strings, joined to this table at render time. That join is the
 * defect the previous phase was written to remove: a label with no icon, or an icon
 * for a path that no longer exists, failed silently. One table cannot drift from
 * itself, so the icon is a field on the route and `navRegistry` is gone.
 *
 * ## Why `mobileTab` is a number and not a boolean
 *
 * The dock shows four destinations and puts the rest behind 「更多」. Which four is a
 * product decision per role, and a boolean would leave the order to whatever the
 * array happened to be - which is the *sidebar's* order, and the two are not the same
 * question. A number makes "the fourth tab" a fact rather than an accident of layout.
 *
 * ## Why the table is a function
 *
 * `layoutRoutes()` and `flatRoutesWithAdmin()` are functions rather than constants
 * because the admin path is injected by the server at runtime
 * (`window.__TC_CONFIG__.adminPath`). A module-level constant would freeze it at
 * import time, before the config is guaranteed to be present, and would put the
 * deployment path back in the built bundle. The admin nav group is keyed on the
 * literal `/beiadmin` for the same reason the icon table used to be: a lookup keyed on
 * a renamed deployment path would miss on every deployment that renamed it.
 */

import { adminPath } from '@/constants';

import type { ClassFeatureKey } from '@/lib/classFeatures.generated';
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

/** One flag, or any one of several - matching `FeatureRequirement` in featureRoutes.ts. */
export type RouteFeatureRequirement =
  | { key: ClassFeatureKey }
  | { anyOf: ClassFeatureKey[] };

/**
 * How a page is laid out once it is routed.
 *
 * - `workbench` - the default console: sidebar, context bar, content.
 * - `immersive` - a full-bleed canvas. The game surfaces and the projection stage
 *   own the whole viewport, and the shell's chrome would be in the way.
 */
export type LayoutMode = 'workbench' | 'immersive';

export interface PageRoute {
  /**
   * Path relative to the parent layout, or absolute for a flat route.
   *
   * A parameterised segment is matched for the active state by prefix and by the
   * shape of the pattern rather than by string equality - see `usePageMeta`.
   */
  path: string;
  /** Module path of the page component, e.g. `@/features/economy/pages/StudentBankPage`. */
  component: string;
  /**
   * Menu label.
   *
   * `label` present means "this is a destination": it appears in the rail, in the
   * command palette, and in the mobile drawer. Absent means the page is reachable
   * but is not a place you navigate to from a menu - a detail view opened from a
   * row, an editor opened from a list, a redirect target.
   */
  label?: string;
  /** The rail icon. Required whenever `label` is present; a guardrail asserts it. */
  icon?: LucideIcon;
  /** Which rail section this destination belongs to. */
  group?: string;
  /**
   * Dock position on a phone, 1-4. At most four per role; a guardrail asserts it.
   *
   * Numbered rather than ordered by array position because the dock answers a
   * different question from the sidebar ("what do I reach for constantly?" vs
   * "what does this console contain?"), and tying them together produced a dock
   * whose first tab was whatever happened to be listed first.
   */
  mobileTab?: number;
  /** Layout mode. Absent means `workbench`. */
  mode?: LayoutMode;
  /** Present when the page is gated on a class feature flag. */
  feature?: { requirement: RouteFeatureRequirement; title: string; role: 'student' | 'parent' };
  /**
   * Extra search terms for the command palette.
   *
   * The palette matches on the label, the group and these aliases, so a teacher who
   * types "成绩" finds 考试与成绩 and one who types "score" finds it too. CJK input
   * has no word boundaries, so substring matching on the label is the mechanism and
   * the aliases are the escape hatch when the label does not contain the word a
   * reader would use.
   */
  aliases?: string[];
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
 * `component` paths here are page modules that happen to sit in the legacy
 * `src/pages` tree. They are still resolved through the same map, so moving one into
 * a feature plugin later is a one-line change here.
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
 * Rail sections, per layout.
 *
 * The previous rail was one flat list of 25 entries in the teacher console, ordered
 * by nothing a reader could perceive, and it scrolled. Grouping is what makes a
 * console of this size navigable: five sections of four to six entries each, every
 * one of them short enough to read without scrolling.
 *
 * `key` is matched against a route's `group`, so a route in no group lands in a
 * trailing section rather than vanishing.
 */
export interface NavGroup {
  key: string;
  label: string;
  icon?: LucideIcon;
}

const TEACHER_GROUPS: NavGroup[] = [
  { key: 'class', label: '班级运营', icon: Users },
  { key: 'study', label: '教学与学业', icon: BookOpen },
  { key: 'play', label: '游戏化玩法', icon: Sparkles },
  { key: 'reward', label: '积分与商城', icon: Store },
  { key: 'insight', label: '数据与工具', icon: BarChart },
  { key: 'system', label: '系统', icon: Settings },
];

const STUDENT_GROUPS: NavGroup[] = [
  { key: 'me', label: '我的成长', icon: Star },
  { key: 'play', label: '冒险与玩法', icon: Swords },
  { key: 'study', label: '学业', icon: BookOpen },
  { key: 'system', label: '设置', icon: UserCog },
];

const PARENT_GROUPS: NavGroup[] = [
  { key: 'home', label: '家园', icon: Home },
  { key: 'study', label: '学业', icon: BookOpen },
  { key: 'system', label: '设置', icon: UserCog },
];

const ADMIN_GROUPS: NavGroup[] = [
  { key: 'overview', label: '总览', icon: LayoutDashboard },
  { key: 'content', label: '内容与站点', icon: Globe },
  { key: 'people', label: '人员与权限', icon: Users },
  { key: 'system', label: '系统', icon: Server },
];

/**
 * The rail sections for a layout, in order.
 *
 * The admin console is identified by its **layout module**, not by its path: that
 * path is injected by the server at runtime, so a set of conditions keyed on
 * `/beiadmin` silently misses on every deployment that renamed it. This is the same
 * mistake the old icon table made, and the reason it needed `ADMIN_KEY` at all.
 */
export function navGroupsFor(layoutPath: string, layoutModule?: string): NavGroup[] {
  if (layoutPath === '/teacher') return TEACHER_GROUPS;
  if (layoutPath === '/student') return STUDENT_GROUPS;
  if (layoutPath === '/parent') return PARENT_GROUPS;
  if (layoutModule?.endsWith('/AdminLayout')) return ADMIN_GROUPS;
  if (layoutPath.endsWith('/AdminLayout')) return ADMIN_GROUPS;
  return [];
}

/**
 * Layout routes that are not tied to the deployment's admin path.
 *
 * The admin routes are built separately (see `layoutRoutes()`) because their path
 * comes from the server at runtime - baking it in here is what forced a deploy-time
 * `sed` rewrite of the built bundle.
 */
const roleLayoutRoutes: LayoutRoute[] = [
  {
    path: '/teacher',
    layout: '@/app/layouts/TeacherLayout',
    allowedRoles: ['teacher', 'superadmin'],
    children: [
      // Listed in dock/section order. `group` places an entry in the rail;
      // `mobileTab` marks it as one of the four the dock shows.
      {
        path: '',
        component: '@/features/classroom/pages/TeacherDashboardPage',
        label: '班级与学生管理',
        icon: Users,
        group: 'class',
        mobileTab: 1,
        aliases: ['班级', '学生', 'dashboard'],
      },
      {
        path: 'attendance',
        component: '@/pages/Teacher/Attendance',
        label: '考勤与请假',
        icon: CalendarCheck,
        group: 'class',
        mobileTab: 2,
        aliases: ['考勤', '请假', 'attendance'],
      },
      {
        path: 'records',
        component: '@/features/classroom/pages/TeacherRecordsPage',
        label: '积分与兑换记录',
        icon: ClipboardList,
        group: 'class',
        aliases: ['积分', '记录', '兑换'],
      },
      {
        path: 'certificates',
        component: '@/features/engagement/pages/TeacherCertificatesPage',
        label: '荣誉奖状',
        icon: Award,
        group: 'class',
        aliases: ['奖状', '荣誉'],
      },
      {
        path: 'communication',
        component: '@/features/engagement/pages/TeacherCommunicationPage',
        label: '家校与留言',
        icon: MessageCircle,
        group: 'class',
        mobileTab: 3,
        aliases: ['家校', '留言', '信箱', '消息'],
      },

      {
        // The homework system that replaced the legacy 作业管理 page. `assignments` below is kept as
        // an alias so existing bookmarks, the teacher dock's fourth slot and anything else that
        // still points at `/teacher/assignments` keep landing on a working screen instead of a 404.
        path: 'homework',
        component: '@/features/homework/pages/TeacherHomeworkPage',
        label: '作业管理',
        icon: BookOpen,
        group: 'study',
        mobileTab: 4,
        aliases: ['作业', 'homework', 'homework'],
      },
      {
        // The alias itself: same screen, no menu entry, no dock slot. `label` is absent, which is
        // what makes it reachable-but-not-a-destination.
        path: 'assignments',
        component: '@/features/homework/pages/TeacherHomeworkPage',
        aliases: ['作业', 'homework'],
      },
      {
        // Not in the menu: opened from a row on the list above.
        path: 'homework/:id/grade',
        component: '@/features/homework/pages/TeacherHomeworkGradePage',
      },
      {
        path: 'exams',
        component: '@/features/learning/pages/TeacherExamsPage',
        label: '考试与成绩',
        icon: FileSpreadsheet,
        group: 'study',
        aliases: ['考试', '成绩', 'exam', 'score'],
      },
      {
        path: 'papers',
        component: '@/features/learning/pages/TeacherPapersPage',
        label: '试卷系统',
        icon: FileText,
        group: 'study',
        aliases: ['试卷', '组卷'],
      },
      {
        path: 'knowledge',
        component: '@/features/learning/pages/TeacherKnowledgeGraphPage',
        label: '知识点图谱',
        icon: Network,
        group: 'study',
        aliases: ['知识点', '图谱'],
      },
      {
        // The teacher half of AI 智学: which knowledge points the class is collectively missing, and
        // who to dispatch a practice set to. Not feature-gated on the route - a teacher's menu entry
        // is governed by `teacherMenuGates` instead, because "should this clutter the rail" and "may
        // this role open it" are different questions (the route is available to whoever bookmarks it).
        path: 'ai-study',
        component: '@/features/ai-study/pages/TeacherAiStudyPage',
        label: 'AI 智学看板',
        icon: Sparkles,
        group: 'study',
        aliases: ['AI', '智学', '学情', '派发'],
      },

      {
        path: 'team-quests',
        component: '@/features/collaboration/pages/TeacherTeamQuestsPage',
        label: '团队任务',
        icon: Target,
        group: 'play',
        aliases: ['团队', '任务'],
      },
      {
        path: 'pets',
        component: '@/features/pet/pages/TeacherPetsPage',
        label: '精灵管理',
        icon: Sparkles,
        group: 'play',
        aliases: ['精灵', '宠物', 'pet'],
      },
      {
        path: 'brawl',
        component: '@/features/battles/pages/TeacherBrawlPage',
        label: '跨班大乱斗',
        icon: Swords,
        group: 'play',
        aliases: ['大乱斗', '对战'],
      },
      {
        path: 'territory',
        component: '@/features/slg/pages/TeacherTerritoryPage',
        label: '领土扩张',
        icon: Map,
        group: 'play',
        aliases: ['领土', '版图', 'slg'],
      },
      {
        path: 'world-boss',
        component: '@/features/challenge/pages/TeacherWorldBossPage',
        label: '世界BOSS管理',
        icon: ShieldAlert,
        group: 'play',
        aliases: ['世界BOSS', 'boss'],
      },

      {
        path: 'shop',
        component: '@/features/marketplace/pages/TeacherShopPage',
        label: '商品管理',
        icon: Store,
        group: 'reward',
        aliases: ['商品', '商城'],
      },
      {
        path: 'economy',
        component: '@/features/economy/pages/TeacherEconomyPage',
        label: '股票管理',
        icon: Landmark,
        group: 'reward',
        aliases: ['股票', '股市'],
      },
      {
        path: 'auction',
        component: '@/features/marketplace/pages/TeacherAuctionPage',
        label: '拍卖行管理',
        icon: Gavel,
        group: 'reward',
        aliases: ['拍卖'],
      },
      {
        path: 'blind-box',
        component: '@/features/marketplace/pages/TeacherBlindBoxPage',
        label: '盲盒管理',
        icon: Package,
        group: 'reward',
        aliases: ['盲盒'],
      },
      {
        path: 'lucky-draw-config',
        component: '@/features/engagement/pages/TeacherLuckyDrawConfigPage',
        label: '抽奖设置',
        icon: Gift,
        group: 'reward',
        aliases: ['抽奖', '翻牌'],
      },
      {
        path: 'verification',
        component: '@/pages/Teacher/Verification',
        label: '奖品核销',
        icon: CheckCircle,
        group: 'reward',
        aliases: ['核销', '兑奖'],
      },

      {
        path: 'analysis',
        component: '@/pages/Teacher/Analysis',
        label: '数据分析',
        icon: BarChart,
        group: 'insight',
        aliases: ['分析', '报表'],
      },
      {
        path: 'tools',
        component: '@/features/classroom/pages/TeacherToolsPage',
        label: '教学工具',
        icon: Wrench,
        group: 'insight',
        aliases: ['工具', '点名', '倒计时'],
      },
      {
        path: 'bigscreen',
        component: '@/features/classroom/pages/TeacherBigscreenPage',
        label: '大屏展示',
        icon: MonitorPlay,
        group: 'insight',
        mode: 'immersive',
        aliases: ['大屏', '投屏'],
      },

      {
        path: 'features',
        component: '@/pages/Teacher/Features',
        label: '功能开关',
        icon: Settings,
        group: 'system',
        aliases: ['开关', '功能'],
      },
      {
        path: 'settings',
        component: '@/features/auth/pages/ProfileSettingsPage',
        label: '个人设置',
        icon: UserCog,
        group: 'system',
        aliases: ['设置', '账号', '密码'],
      },

      // Reachable, never a menu entry: an editor opened from a list, the tree view
      // opened from a quest, and the add-student flow opened from the dashboard.
      { path: 'add-student', component: '@/features/classroom/pages/TeacherAddStudentPage' },
      { path: 'task-tree', component: '@/features/collaboration/pages/TeacherTaskTreePage' },
      { path: 'papers/:id/edit', component: '@/features/learning/pages/TeacherPaperEditorPage' },
    ],
  },
  {
    path: '/student',
    layout: '@/app/layouts/StudentLayout',
    allowedRoles: ['student'],
    children: [
      {
        path: '',
        component: '@/features/classroom/pages/StudentOverviewPage',
        label: '成长总览',
        icon: Home,
        group: 'me',
        mobileTab: 1,
        aliases: ['首页', '成长', '参与', '合作', '竞技'],
      },
      {
        path: 'pet',
        component: '@/features/pet/pages/StudentPetPage',
        label: '我的精灵',
        icon: Star,
        group: 'me',
        aliases: ['精灵', '宠物', 'pet'],
      },
      {
        path: 'achievements',
        component: '@/features/classroom/pages/StudentAchievementsPage',
        label: '成就墙',
        icon: Medal,
        group: 'me',
        mobileTab: 2,
        feature: { requirement: { key: 'enable_achievements' }, title: '成就墙', role: 'student' },
        aliases: ['成就', '徽章'],
      },
      {
        path: 'certificates',
        component: '@/features/engagement/pages/StudentCertificatesPage',
        label: '荣誉奖状',
        icon: Award,
        group: 'me',
        aliases: ['奖状', '荣誉'],
      },
      {
        path: 'my-redemptions',
        component: '@/features/engagement/pages/StudentMyRedemptionsPage',
        label: '我的兑换',
        icon: Ticket,
        group: 'me',
        aliases: ['兑换', '订单'],
      },

      {
        path: 'shop',
        component: '@/features/marketplace/pages/StudentShopPage',
        label: '积分商城',
        icon: ShoppingBag,
        group: 'play',
        mobileTab: 3,
        feature: { requirement: { key: 'enable_shop' }, title: '积分商城', role: 'student' },
        aliases: ['商城', '商店', '积分'],
      },
      {
        path: 'dungeon',
        component: '@/features/dungeon/pages/StudentDungeonPage',
        label: '无尽塔',
        icon: Skull,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_dungeon' }, title: '无尽塔', role: 'student' },
        aliases: ['无尽塔', '爬塔', 'dungeon'],
      },
      {
        path: 'challenge',
        component: '@/features/challenge/pages/StudentChallengePage',
        label: '挑战模式',
        icon: Swords,
        group: 'play',
        feature: { requirement: { key: 'enable_challenge' }, title: '挑战模式', role: 'student' },
        aliases: ['挑战', '闯关'],
      },
      {
        path: 'gacha',
        component: '@/features/gacha/pages/StudentGachaPage',
        label: '召唤法阵',
        icon: Sparkles,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_gacha' }, title: '召唤法阵', role: 'student' },
        aliases: ['召唤', '抽卡', 'gacha'],
      },
      {
        path: 'lucky-draw',
        component: '@/features/engagement/pages/StudentLuckyDrawPage',
        label: '翻牌抽奖',
        icon: Gift,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_lucky_draw' }, title: '翻牌抽奖', role: 'student' },
        aliases: ['抽奖', '翻牌'],
      },
      {
        path: 'brawl',
        component: '@/features/battles/pages/StudentBrawlPage',
        label: '大乱斗',
        icon: Crosshair,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_class_brawl' }, title: '大乱斗', role: 'student' },
        aliases: ['大乱斗', '对战'],
      },
      {
        path: 'territory',
        component: '@/features/slg/pages/StudentTerritoryPage',
        label: '版图',
        icon: MapPin,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_slg' }, title: '版图', role: 'student' },
        aliases: ['版图', '领土', 'slg'],
      },
      {
        path: 'task-tree',
        component: '@/features/collaboration/pages/StudentTaskTreePage',
        label: '技能树',
        icon: GitBranch,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_task_tree' }, title: '技能树', role: 'student' },
        aliases: ['技能树', '加点'],
      },
      {
        path: 'bank',
        component: '@/features/economy/pages/StudentBankPage',
        label: '银行股市',
        icon: Building2,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_economy' }, title: '银行股市', role: 'student' },
        aliases: ['银行', '股市', '理财'],
      },
      {
        path: 'guild-pk',
        component: '@/features/classroom/pages/StudentGuildPKPage',
        label: '公会PK',
        icon: Swords,
        group: 'play',
        mode: 'immersive',
        feature: { requirement: { key: 'enable_guild_pk' }, title: '公会PK', role: 'student' },
        aliases: ['公会', 'PK'],
      },
      {
        path: 'auction',
        component: '@/features/marketplace/pages/StudentAuctionPage',
        label: '拍卖行',
        icon: Gavel,
        group: 'play',
        feature: { requirement: { key: 'enable_auction_blind_box' }, title: '拍卖行', role: 'student' },
        aliases: ['拍卖', '盲盒'],
      },
      {
        path: 'interactive-wall',
        component: '@/features/engagement/pages/StudentInteractiveWallPage',
        label: '互动墙',
        icon: MessageSquare,
        group: 'play',
        feature: {
          requirement: { anyOf: ['enable_chat_bubble', 'enable_tree_hole'] },
          title: '互动墙',
          role: 'student',
        },
        aliases: ['互动', '留言', '弹幕', '树洞'],
      },
      {
        path: 'peer-review',
        component: '@/features/engagement/pages/StudentPeerReviewPage',
        label: '同伴互评',
        icon: MessageSquareHeart,
        group: 'play',
        feature: { requirement: { key: 'enable_peer_review' }, title: '同伴互评', role: 'student' },
        aliases: ['互评', '评价'],
      },

      {
        // The homework system that replaced the legacy 学业中心 page. `assignments` below keeps the
        // old path working for bookmarks and the student dock's fourth slot.
        path: 'homework',
        component: '@/features/homework/pages/StudentHomeworkPage',
        label: '我的作业',
        icon: BookOpen,
        group: 'study',
        mobileTab: 4,
        aliases: ['作业', 'homework'],
      },
      {
        // Same screen as above, reached by the old path. No label, so no second menu entry.
        path: 'assignments',
        component: '@/features/homework/pages/StudentHomeworkPage',
        aliases: ['作业', '学业'],
      },
      {
        // Not in the menu: the attempt and result views are opened from a row on the list above.
        path: 'homework/:id',
        component: '@/features/homework/pages/StudentHomeworkAttemptPage',
      },
      {
        path: 'homework/:id/result',
        component: '@/features/homework/pages/StudentHomeworkResultPage',
      },
      {
        path: 'team-quests',
        component: '@/features/collaboration/pages/StudentTeamQuestsPage',
        label: '团队任务',
        icon: Users,
        group: 'study',
        aliases: ['团队', '任务'],
      },
      {
        path: 'papers',
        component: '@/features/learning/pages/StudentPapersPage',
        label: '试卷练习',
        icon: FileText,
        group: 'study',
        aliases: ['试卷', '练习'],
      },
      {
        path: 'plan',
        component: '@/features/learning/pages/StudentPlanPage',
        label: '学习计划',
        icon: ListChecks,
        group: 'study',
        aliases: ['计划', '目标'],
      },

      {
        path: 'wrong-questions',
        component: '@/features/learning/pages/StudentWrongQuestionsPage',
        label: '错题本',
        icon: ListChecks,
        group: 'study',
        aliases: ['错题'],
      },

      {
        // AI 智学: today's practice set, chosen by the local rule and explained line by line. The
        // route is feature-gated on `enable_ai_study` - every class-scope feature starts off (see
        // `api/db.ts`'s one-shot default-off backfill), so a teacher turns this on in 功能控制台 like
        // any other. No `mobileTab`: the student dock's four slots are taken, and the UI-R guardrail
        // fails on a fifth rather than letting it silently vanish.
        path: 'ai-study',
        component: '@/features/ai-study/pages/StudentAiStudyPage',
        label: 'AI 智学',
        icon: Sparkles,
        group: 'study',
        aliases: ['AI', '智学', '练习', '推荐'],
        feature: { requirement: { key: 'enable_ai_study' }, title: 'AI 智学', role: 'student' },
      },
      {
        // Not in the menu: the answering screen is opened from a set on the page above. The id is a
        // practice set, not a question, so the page owns saving, submitting and the result summary.
        path: 'ai-study/:id',
        component: '@/features/ai-study/pages/StudentAiStudyAttemptPage',
      },

      // One settings page for all four roles - see `ProfileSettingsPage`. It carries
      // the account form and the「重新开始引导」action that replays the opening guide.
      {
        path: 'settings',
        component: '@/features/auth/pages/ProfileSettingsPage',
        label: '个人设置',
        icon: UserCog,
        group: 'system',
        aliases: ['设置', '账号', '密码'],
      },

      // Not in the menu: reached by navigating to a specific paper.
      { path: 'papers/:id', component: '@/features/learning/pages/StudentPaperAttemptPage' },
    ],
  },
  {
    path: '/parent',
    layout: '@/app/layouts/ParentLayout',
    allowedRoles: ['parent'],
    children: [
      {
        path: 'dashboard',
        component: '@/pages/Parent/Dashboard',
        label: '温馨家园',
        icon: Home,
        group: 'home',
        mobileTab: 1,
        aliases: ['家园', '首页'],
      },
      {
        path: 'communication',
        component: '@/features/engagement/pages/ParentCommunicationPage',
        label: '家校信箱',
        icon: MessageSquare,
        group: 'home',
        mobileTab: 2,
        aliases: ['信箱', '留言', '沟通'],
      },
      {
        path: 'report',
        component: '@/pages/Parent/Report',
        label: '成长足迹',
        icon: PieChart,
        group: 'home',
        mobileTab: 3,
        aliases: ['成长', '报告'],
      },
      {
        path: 'tasks',
        component: '@/pages/Parent/Tasks',
        label: '家庭时光',
        icon: CheckSquare,
        group: 'home',
        feature: { requirement: { key: 'enable_family_tasks' }, title: '家庭时光', role: 'parent' },
        aliases: ['家庭', '任务'],
      },
      {
        path: 'leave-request',
        component: '@/pages/Parent/LeaveRequest',
        label: '请假假条',
        icon: Calendar,
        group: 'home',
        mobileTab: 4,
        aliases: ['请假', '假条'],
      },
      {
        path: 'assignments',
        component: '@/pages/Parent/Assignments',
        label: '学习采撷',
        icon: BookOpen,
        group: 'study',
        aliases: ['作业', '学习'],
      },
      {
        path: 'settings',
        component: '@/features/auth/pages/ProfileSettingsPage',
        label: '个人设置',
        icon: UserCog,
        group: 'system',
        aliases: ['设置', '账号', '密码'],
      },
    ],
  },
];

/**
 * Route table as data.
 *
 * `layoutRoutes()` and `flatRoutesWithAdmin()` are functions rather than constants
 * because the admin path is injected by the server at runtime. See the module note.
 */
export function layoutRoutes(): LayoutRoute[] {
  return [
    ...roleLayoutRoutes,
    {
      path: adminPath(),
      layout: '@/app/layouts/AdminLayout',
      allowedRoles: ['admin', 'superadmin'],
      children: [
        {
          path: '',
          component: '@/features/admin/pages/AdminDashboardPage',
          label: '系统仪表盘',
          icon: LayoutDashboard,
          group: 'overview',
          mobileTab: 1,
          aliases: ['仪表盘', '首页'],
        },
        {
          path: 'announcements',
          component: '@/features/admin/pages/AdminAnnouncementsPage',
          label: '公告管理',
          icon: Megaphone,
          group: 'content',
          mobileTab: 2,
          aliases: ['公告'],
        },
        {
          path: 'articles',
          component: '@/features/admin/pages/AdminArticlesPage',
          label: '文章管理',
          icon: FileText,
          group: 'content',
          aliases: ['文章', '资讯'],
        },
        {
          path: 'website',
          component: '@/features/admin/pages/AdminWebsitePage',
          label: '网站设置',
          icon: Globe,
          group: 'content',
          aliases: ['网站', '站点'],
        },
        {
          path: 'teachers',
          component: '@/features/admin/pages/AdminTeachersPage',
          label: '教师管理',
          icon: Users,
          group: 'people',
          mobileTab: 3,
          aliases: ['教师', '老师'],
        },
        {
          path: 'codes',
          component: '@/features/admin/pages/AdminCodesPage',
          label: '激活码管理',
          icon: Key,
          group: 'people',
          aliases: ['激活码', '卡密'],
        },
        {
          path: 'openapi',
          component: '@/features/admin/pages/AdminOpenApiPage',
          label: '开发者与校园',
          icon: Server,
          group: 'people',
          aliases: ['开放接口', '校园'],
        },
        {
          path: 'audit-logs',
          component: '@/features/admin/pages/AdminAuditLogsPage',
          label: '审计日志',
          icon: Shield,
          group: 'system',
          aliases: ['日志', '审计'],
        },
        {
          path: 'settings',
          component: '@/features/admin/pages/AdminSettingsPage',
          label: '系统设置',
          icon: Settings,
          group: 'system',
          mobileTab: 4,
          aliases: ['设置', '配置'],
        },
        {
          path: 'reset',
          component: '@/features/admin/pages/AdminSystemResetPage',
          label: '系统重置',
          icon: AlertTriangle,
          group: 'system',
          aliases: ['重置', '清空'],
        },
        {
          // The console's own account settings. `settings` above is 系统设置 (the
          // deployment's configuration), so the personal page needs its own path
          // rather than a second meaning for the same one.
          path: 'profile',
          component: '@/features/auth/pages/ProfileSettingsPage',
          label: '个人设置',
          icon: UserCog,
          group: 'system',
          aliases: ['账号', '密码'],
        },
      ],
    },
  ];
}

/** Flat routes plus the admin login route, whose path is also deployment-dependent. */
export function flatRoutesWithAdmin(): PageRoute[] {
  return [...flatRoutes, { path: `${adminPath()}/login`, component: '@/features/admin/pages/AdminLoginPage' }];
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
