/**
 * The guided tour's step definitions.
 *
 * ## What this replaced
 *
 * The first version of this feature was four full-screen scenes that played over the application -
 * a title, a menu preview and some role copy, advanced by a timer. Nothing in it was connected to
 * the interface it was describing, and it could not tell whether the reader had understood anything,
 * because it was never watching.
 *
 * This is the other thing: every step names a real element by a `data-tour` anchor, the spotlight is
 * cut around that element, and a step whose `action` is not `next` is only finished when the reader
 * actually performs the action - the click lands on the real button, the panel really opens, the
 * page really navigates.
 *
 * ## The two halves of a tour
 *
 * A tour is **core steps** followed by **derived feature steps**.
 *
 * The core steps are written here: they are the handful of things a new account has to do, and they
 * are the ones that wait for a real gesture. The feature steps are *generated* from the route table
 * by `featureCatalogue.ts`, one per menu entry, so that every feature has a sentence explaining what
 * it is for. Hand-writing those was the mistake the first version made: it covered six of a
 * teacher's twenty-five features, and would have covered six again the next time a menu entry was
 * added. Generated, the coverage is total and stays total.
 *
 * ## Why the anchors are a convention rather than selectors
 *
 * A step could have looked its target up by CSS class or by text. Both break the first time someone
 * restyles a button or rewords a label, and they break *silently* - the tour keeps running and
 * simply highlights nothing. `data-tour="…"` is inert markup that a component opts into, so a step
 * and its target are connected by an explicit, greppable name.
 *
 * ## Why the teacher tour has two shapes
 *
 * A teacher with no class does not see the dashboard: `TeacherDashboardPage` renders
 * `FirstRunWizard` in its place, so `新建班级`, the search box and `添加学生` do not exist yet. A tour
 * that named them would spotlight nothing on the one screen a brand-new teacher is guaranteed to
 * see. So the teacher's core steps are chosen from whether a class exists; the feature half is the
 * same either way.
 */

import { adminPath } from '@/constants';

import type { User } from '@/store/useStore';

import { overviewSteps } from './featureCatalogue';

/** The four audiences the tour speaks to. `superadmin` shares the console's. */
export type GuideRole = 'teacher' | 'student' | 'parent' | 'admin';

/**
 * What the step demonstrates, and - except for `next` and `drag` - what finishes it.
 *
 * `click`, `input` and `select` are watched for on the real element. `hover` and `drag` are
 * demonstrations only: a hover that advanced the tour would fire on every accidental brush of the
 * mouse, which across twenty-five consecutive menu entries would skip the tour for the reader, and a
 * drag is not something to require on a step whose point is "this feature exists".
 */
export type TourAction = 'next' | 'click' | 'input' | 'hover' | 'select' | 'drag';

export interface TourStep {
  id: string;
  /**
   * The `data-tour` value to spotlight, or `null` for a step that is deliberately unanchored.
   *
   * A step with an anchor that cannot be found on the current screen renders its `fallback` copy
   * centred, without a spotlight - see `GuidedTour`.
   */
  anchor: string | null;
  title: string;
  /** One or two sentences. This is a tooltip, not documentation. */
  description: string;
  action: TourAction;
  /** Shown instead of `description` when the anchor is not on screen. */
  fallback?: string;
  /** Label for the primary button. Defaults to `下一步`, or `完成` on the last step. */
  primaryLabel?: string;
}

/** The `data-tour` value for a sidebar entry. Built here so a step cannot misspell a path. */
export function navAnchor(path: string): string {
  return `nav:${path}`;
}

/** The layout path whose menu this role navigates by. */
export function guideLayoutPath(role: GuideRole): string {
  return role === 'admin' ? adminPath() : `/${role}`;
}

/**
 * The four roles the tour knows, or `null` for an account it has no tour for.
 *
 * `superadmin` and `admin` share the console's tour: they are the same surface, and the difference
 * between them is a permission boundary rather than a different first day.
 */
export function guideRole(role: User['role'] | string | undefined): GuideRole | null {
  if (role === 'teacher' || role === 'student' || role === 'parent') return role;
  if (role === 'admin' || role === 'superadmin') return 'admin';
  return null;
}

export interface TourContext {
  /** Whether the account already owns a class. Only the teacher's core steps branch on it. */
  hasClass: boolean;
}

const TEACHER_CORE_WITH_CLASS: TourStep[] = [
  {
    id: 'teacher-nav',
    anchor: 'sidebar-nav',
    title: '这里是你的全部功能',
    description: '左侧菜单按用途分组：上课、出题、玩法和设置都在里面。跟着走一圈，你就不用再找功能了。',
    action: 'next',
    fallback: '左侧菜单就是你的全部功能入口。',
  },
  {
    id: 'teacher-search',
    anchor: 'teacher-search',
    title: '先找到学生',
    description: '班上人多时，用姓名或账号在这里筛选。试着输入一个字 —— 下面立刻只看匹配的人。',
    action: 'input',
    fallback: '这个搜索框只在你已经有班级、并且进入了主控台时出现。',
  },
  {
    id: 'teacher-tools',
    anchor: 'teacher-tools-toggle',
    title: '课堂上的随机工具',
    description: '抽人、随机分组、计时器都在这里。点一下真正打开它。',
    action: 'click',
    fallback: '「课堂工具」在主控台顶部的操作区，需要一个已选中的班级。',
  },
  {
    id: 'teacher-tools-panel',
    anchor: 'teacher-tools-panel',
    title: '工具展开在这里',
    description: '点开之后工具会出现在下方，用完再点一次收起，不会挡住学生名单。',
    action: 'next',
    fallback: '上一步点开「课堂工具」后，面板会出现在这里。',
  },
  {
    id: 'teacher-add-student',
    anchor: 'teacher-add-student',
    title: '把学生加进来',
    description: '整班名单可以一次性粘贴导入，账号会自动生成；也可以只加一个人。',
    action: 'next',
    fallback: '「添加学生」在主控台右侧。',
  },
  {
    id: 'teacher-class-tabs',
    anchor: 'teacher-class-tabs',
    title: '多个班级在这里切换',
    description: '每个班级的名单、小组和功能开关都是独立的，切换班级不会互相影响。',
    action: 'next',
    fallback: '班级标签在主控台最上方。',
  },
];

const TEACHER_CORE_FIRST_RUN: TourStep[] = [
  {
    id: 'teacher-nav',
    anchor: 'sidebar-nav',
    title: '这里是你的全部功能',
    description: '左侧菜单按用途分组。现在你的班级还是空的，所以先把右边这三步走完。',
    action: 'next',
    fallback: '左侧菜单就是你的全部功能入口。',
  },
  {
    id: 'firstrun-class-name',
    anchor: 'firstrun-class-name',
    title: '第一步：给班级起个名字',
    description: '学生登录后看到的就是这个名字。在这里输入试试，比如「三年二班」。',
    action: 'input',
    fallback: '班级名称输入框就在当前页面的第一步里。',
  },
  {
    id: 'firstrun-roster',
    anchor: 'firstrun-roster',
    title: '第二步：把名单粘进来',
    description: '每行一个学生，先写姓名再写登录名（登录名可以省略）。粘贴后账号会自动生成。',
    action: 'input',
    fallback: '名单输入框在创建班级之后出现。',
  },
  {
    id: 'firstrun-features',
    anchor: 'firstrun-features',
    title: '第三步：挑选课堂功能',
    description: '这里决定学生能看到哪些玩法，默认全开。之后在「功能开关」里随时能改。',
    action: 'next',
    fallback: '功能开关在名单导入之后出现。',
  },
];

const STUDENT_CORE: TourStep[] = [
  {
    id: 'student-nav',
    anchor: 'sidebar-nav',
    title: '这些都是你的',
    description: '左侧菜单就是你能用的全部功能。老师没开启的玩法不会出现在这里。',
    action: 'next',
    fallback: '左侧菜单就是你能用的全部功能入口。',
  },
  {
    id: 'student-pet',
    anchor: navAnchor('/student/pet'),
    title: '你的精灵在这里',
    description: '它跟着你的表现一起长大，喂它、陪它玩都会让它变强。',
    action: 'hover',
    fallback: '「我的精灵」在左侧菜单的第一个。',
  },
  {
    id: 'student-assignments',
    anchor: navAnchor('/student/assignments'),
    title: '作业和考试在「学业中心」',
    description: '点进去看看今天的任务。做错的题会自动收进「错题本」，不用自己抄。',
    action: 'click',
    fallback: '「学业中心」在左侧菜单里。',
  },
];

const PARENT_CORE: TourStep[] = [
  {
    id: 'parent-nav',
    anchor: 'sidebar-nav',
    title: '这几个入口就够了',
    description: '你只会看到自己孩子的信息，其他学生的记录不会出现在任何一页。',
    action: 'next',
    fallback: '左侧菜单就是你需要的全部入口。',
  },
  {
    id: 'parent-dashboard',
    anchor: navAnchor('/parent/dashboard'),
    title: '每天先看这里',
    description: '积分、作业和老师的最新反馈都汇总在「温馨家园」。',
    action: 'hover',
    fallback: '「温馨家园」在左侧菜单的第一个。',
  },
  {
    id: 'parent-report',
    anchor: navAnchor('/parent/report'),
    title: '想看长期变化就去「成长足迹」',
    description: '它记录的是趋势，不是某一天的表现。点进去看看。',
    action: 'click',
    fallback: '「成长足迹」在左侧菜单里。',
  },
];

function adminCore(): TourStep[] {
  const base = adminPath();

  return [
    {
      id: 'admin-nav',
      anchor: 'sidebar-nav',
      title: '这是系统工作台',
      description: '公告、文章和网站内容、教师账号、激活码都在左侧，右侧是每个页面的内容。',
      action: 'next',
      fallback: '左侧菜单就是系统工作台的全部入口。',
    },
    {
      id: 'admin-teachers',
      anchor: navAnchor(`${base}/teachers`),
      title: '教师是唯一能建班级的角色',
      description: '在这里创建教师账号并发放给老师。点进去看看。',
      action: 'click',
      fallback: '「教师管理」在左侧菜单里。',
    },
    {
      id: 'admin-settings',
      anchor: navAnchor(`${base}/settings`),
      title: '站点开关在这里',
      description: '是否开放自主注册、站点标题和图标、付费与激活模式都在「系统设置」里。',
      action: 'hover',
      fallback: '「系统设置」在左侧菜单里。',
    },
  ];
}

function coreSteps(role: GuideRole, context: TourContext): TourStep[] {
  switch (role) {
    case 'teacher':
      return context.hasClass ? TEACHER_CORE_WITH_CLASS : TEACHER_CORE_FIRST_RUN;
    case 'student':
      return STUDENT_CORE;
    case 'parent':
      return PARENT_CORE;
    case 'admin':
      return adminCore();
  }
}

/**
 * The steps for a role, in order: the written core steps, then one derived step per feature the
 * core steps did not already cover.
 *
 * The final derived step is always 个人设置 - the last entry in every menu - and it carries the
 * 「完成」 label, so a tour always ends on the page where it can be started again.
 */
export function tourStepsFor(role: GuideRole, context: TourContext): TourStep[] {
  const core = coreSteps(role, context);
  const coveredAnchors = new Set(
    core.map((step) => step.anchor).filter((anchor): anchor is string => anchor !== null),
  );

  return [
    ...core,
    ...overviewSteps({ role, layoutPath: guideLayoutPath(role), coveredAnchors }),
  ];
}
