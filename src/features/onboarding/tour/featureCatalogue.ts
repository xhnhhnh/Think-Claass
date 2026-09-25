/**
 * One line of guidance for every feature in the menu.
 *
 * ## Why this is a catalogue keyed by route, and not steps written by hand
 *
 * The first version of the tour wrote its steps out one at a time and covered about a sixth of the
 * menu: a teacher had six of twenty-five features explained, a student three of twenty-three. That
 * is not a coverage bug that gets fixed by adding steps - it is a coverage bug that comes back the
 * next time somebody adds a menu entry. So the tour *derives* its feature steps from the route table
 * (`navEntries`), and this file holds only what the route table cannot know: what each feature is
 * for, in one sentence.
 *
 * The consequence is the point: `featureCatalogue.test.ts` asserts that every labelled route in
 * every layout has an entry here, so adding a menu entry without a word of guidance fails a test
 * rather than shipping an unexplained feature.
 *
 * ## Why the keys are relative
 *
 * `role:childPath` rather than a resolved path. The admin console's path is injected per deployment
 * (`adminPath()`), so a catalogue keyed on `/beiadmin/teachers` would silently stop matching on an
 * instance that renamed the console - and every one of its eleven features would fall back to
 * generic copy.
 *
 * ## Where the closing step comes from
 *
 * Every menu ends with 个人设置, and that page is also where the tour can be replayed. So the last
 * derived step is promoted to the tour's final step (see `overviewSteps`) rather than a hand-written
 * closer being appended after it - which is why there is no separate "replay" step to drift out of
 * step with the menu's own order.
 */

import { navItems } from '@/app/nav/navRegistry';

import { navAnchor, type GuideRole, type TourStep } from './tourSteps';

/**
 * A sentence per feature. Keyed `${role}:${childPath}`, where `childPath` is the route table's own
 * child path (`''` for a layout's index route).
 */
export const FEATURE_COPY: Record<string, string> = {
  // --- teacher ---------------------------------------------------------------------------------
  'teacher:': '主控台。班级标签、学生名单、加分、分组和课堂工具都在这一页。',
  'teacher:attendance': '记考勤、处理学生的请假申请。',
  'teacher:homework': '发布作业、选题批改，AI 可以帮你判分。',
  'teacher:assignments': '布置作业、看谁交了谁没交。',
  'teacher:exams': '建考试、录成绩，成绩会自动进数据分析。',
  'teacher:papers': '组卷：按章节挑题、排结构、导出。',
  'teacher:knowledge': '维护知识点以及它们之间的先后关系。',
  'teacher:ai-study': 'AI 智学看板：班级集体薄弱的知识点，以及给谁派一份练单。',
  'teacher:team-quests': '给小组布置协作任务并跟踪完成情况。',
  'teacher:pets': '学生精灵的形象、属性与成长曲线。',
  'teacher:brawl': '班级与班级之间的对战。',
  'teacher:territory': '小组扩张版图并领取产出。',
  'teacher:records': '每一笔加分、扣分和兑换的流水，对不上账时查这里。',
  'teacher:certificates': '生成、发放荣誉奖状。',
  'teacher:shop': '上架积分商品、设置价格与库存。',
  'teacher:economy': '银行利率与班级股市的行情。',
  'teacher:auction': '拍卖场次、起拍价与规则。',
  'teacher:blind-box': '盲盒奖池与各项概率。',
  'teacher:features': '19 项课堂能力的总开关，关掉的功能学生端会直接消失。',
  'teacher:world-boss': '世界BOSS的血量、阶段与开放时间。',
  'teacher:lucky-draw-config': '九宫格抽奖的花费和每一格的概率。',
  'teacher:verification': '核销学生出示的兑换凭证。',
  'teacher:communication': '与家长的消息往来和班级公告。',
  'teacher:analysis': '班级与学生两个维度的统计与趋势。',
  'teacher:tools': '课堂上快速操作小组积分的工具。',
  'teacher:bigscreen': '投影用的大屏：积分榜、倒计时和实时动态。',
  'teacher:settings': '改自己的账号密码，也可以从这里重看这段教程。',

  // --- student ---------------------------------------------------------------------------------
  'student:': '成长总览。成长、合作、竞技和参与四个维度都能在这里看到。',
  'student:pet': '你的精灵。它跟着你的表现一起长大。',
  'student:shop': '用积分兑换奖励。老师开放后才会出现。',
  'student:auction': '用积分竞拍稀有奖励。',
  'student:challenge': '答题闯关，也可以参与世界BOSS。',
  'student:lucky-draw': '花积分翻牌，试试手气。',
  'student:my-redemptions': '你兑换过的东西和对应的核销码。',
  'student:certificates': '你收到过的奖状。',
  'student:achievements': '已经解锁的徽章，以及还差什么。',
  'student:interactive-wall': '留言和树洞，写下想说的话。',
  'student:peer-review': '给同学的作品打分和评价。',
  'student:dungeon': '一层一层往上打的无尽塔。',
  'student:brawl': '代表班级出战。',
  'student:gacha': '在召唤法阵里收集角色。',
  'student:task-tree': '解锁技能树上的节点。',
  'student:territory': '为你的小组扩张版图。',
  'student:bank': '把积分存起来，或者买股票。',
  'student:guild-pk': '小组之间的比拼。',
  'student:homework': '做作业：可以答题，也可以拍照上传，还能问 AI。',
  'student:assignments': '作业和考试都在这里，做错的题会自动进错题本。',
  'student:team-quests': '和小组一起完成的任务。',
  'student:papers': '做老师发布的试卷，交卷后能看解析。',
  'student:wrong-questions': '自动收集你做错的题，可以重做。',
  'student:ai-study': 'AI 智学：按你的错题和薄弱知识点挑出今天该练的几道题，并说明为什么选它。',
  'student:plan': '安排每天要完成的事。',
  'student:settings': '改自己的账号密码，也可以从这里重看这段教程。',

  // --- parent ----------------------------------------------------------------------------------
  'parent:dashboard': '孩子今天的状态：积分、作业和老师的最新反馈。',
  'parent:communication': '直接给老师留言。',
  'parent:report': '一段时间的趋势，而不是某一天的表现。',
  'parent:tasks': '和孩子一起完成的家庭任务。',
  'parent:leave-request': '在线提交请假，不用再写纸条。',
  'parent:assignments': '孩子的作业完成情况。',
  'parent:settings': '改自己的账号密码，也可以从这里重看这段教程。',

  // --- admin -----------------------------------------------------------------------------------
  'admin:': '用户、班级和系统运行状态的总览。',
  'admin:announcements': '发布会出现在所有角色页面上的公告。',
  'admin:articles': '前台的新闻与文章。',
  'admin:website': '官网首页的内容。',
  'admin:teachers': '创建和维护教师账号。教师是唯一能建班级的角色。',
  'admin:codes': '生成、查询和作废激活码。',
  'admin:settings': '站点标题与图标、是否开放自主注册、付费与激活模式。',
  'admin:openapi': 'API 密钥与校园数据对接。',
  'admin:audit-logs': '敏感操作的记录，排查问题先看它。',
  'admin:reset': '清空业务数据的危险操作，请谨慎使用。',
  'admin:profile': '改自己的账号密码，也可以从这里重看这段教程。',
};

/** The key a route's copy lives under. */
export function featureCopyKey(role: GuideRole, childPath: string): string {
  return `${role}:${childPath}`;
}

/** The route table's child path for a resolved menu path. `''` for a layout's index route. */
function childPathOf(layoutPath: string, path: string): string {
  return path === layoutPath ? '' : path.slice(layoutPath.length + 1);
}

const CLOSING_HINT = '这是最后一步，点「完成」结束。';

export interface OverviewStepsOptions {
  role: GuideRole;
  layoutPath: string;
  /** Anchors the role's own steps already point at, so no feature is explained twice. */
  coveredAnchors: ReadonlySet<string>;
}

/**
 * One step per menu entry that no other step already covers.
 *
 * The last entry in a layout's menu is 个人设置, which is also where the tour can be replayed, so
 * that step is promoted to the closing one - it carries the 「完成」 label and the sentence about how
 * to see all of this again. Deriving it rather than appending a hand-written closer is what keeps
 * the tour's ending and the menu's order from disagreeing.
 */
export function overviewSteps({ role, layoutPath, coveredAnchors }: OverviewStepsOptions): TourStep[] {
  const entries = navItems(layoutPath).filter((entry) => !coveredAnchors.has(navAnchor(entry.path)));

  return entries.map((entry, index) => {
    const childPath = childPathOf(layoutPath, entry.path);
    const copy = FEATURE_COPY[featureCopyKey(role, childPath)];
    const description = copy ?? `${entry.label} —— 这个功能的入口就在这里。`;
    const isLast = index === entries.length - 1;

    return {
      id: `feature:${role}:${childPath || 'index'}`,
      anchor: navAnchor(entry.path),
      title: entry.label,
      description: isLast ? `${description}${CLOSING_HINT}` : description,
      // Nothing to perform: these steps exist so no feature is a mystery, not to teach a gesture.
      action: 'hover',
      fallback: `「${entry.label}」在左侧菜单里，当前屏幕上没有它。`,
      ...(isLast ? { primaryLabel: '完成' } : {}),
    } satisfies TourStep;
  });
}
