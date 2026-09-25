import {
  BookOpen,
  ClipboardCheck,
  Compass,
  Lightbulb,
  MessageCircle,
  Newspaper,
  Phone,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Copy and per-section data for the home page.
 *
 * It used to sit at the top of `HomePage.tsx`; it lives here so the page keeps only the
 * data fetch and the composition, and each section imports just the list it renders.
 * Icons are typed as `LucideIcon` because the JSX renders them as components
 * (`<item.icon />`), which an unannotated array literal widens into a union JSX cannot call.
 */

export interface QuickLink {
  icon: LucideIcon;
  title: string;
  description: string;
  link: string;
  color: string;
  bg: string;
}

export interface LearningHighlight {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  bg: string;
}

export interface AudienceCard {
  icon: LucideIcon;
  role: string;
  title: string;
  description: string;
  points: string[];
  color: string;
  bg: string;
}

export interface JourneyStep {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
}

export interface ClassroomMoment {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  details: string[];
  color: string;
  bg: string;
}

export const quickLinks: QuickLink[] = [
  { icon: BookOpen, title: "关于我们", description: "认识我们的教育理念", link: "/about", color: "text-info", bg: "bg-info-soft" },
  { icon: Users, title: "服务介绍", description: "发现有趣的课堂体验", link: "/services", color: "text-success", bg: "bg-success-soft" },
  { icon: Newspaper, title: "最新动态", description: "了解正在发生的新鲜事", link: "/news", color: "text-warning", bg: "bg-warning-soft" },
  { icon: Phone, title: "联系我们", description: "一起开启学习新旅程", link: "/contact", color: "text-participation", bg: "bg-participation-soft" },
];

export const learningHighlights: LearningHighlight[] = [
  { icon: Target, title: "目标清晰", description: "把每一步成长变得看得见", color: "text-info", bg: "bg-info-soft" },
  { icon: Trophy, title: "即时鼓励", description: "让每一次进步都值得庆祝", color: "text-warning", bg: "bg-warning-soft" },
  { icon: Lightbulb, title: "主动探索", description: "在好奇心里发现更多可能", color: "text-participation", bg: "bg-participation-soft" },
];

export const heroSignals: string[] = ["成长有迹可循", "合作彼此成就", "竞技激发潜能", "参与从每一天开始"];

export const audienceCards: AudienceCard[] = [
  {
    icon: Sparkles,
    role: "给学生",
    title: "把学习变成一场愿意继续的探索",
    description: "用任务、奖励和成长记录，把看不见的努力变成可以被感受到的小成就。",
    points: ["目标更清楚", "反馈更及时", "成长更有仪式感"],
    color: "from-info to-info-ink",
    bg: "from-info-soft to-info-soft",
  },
  {
    icon: ClipboardCheck,
    role: "给老师",
    title: "把课堂管理变得更轻、更有秩序",
    description: "把任务推进、学生状态和课堂激励集中起来，减少重复记录，让注意力回到教学本身。",
    points: ["任务可追踪", "表现可沉淀", "激励可持续"],
    color: "from-success to-info",
    bg: "from-success-soft to-info-soft",
  },
  {
    icon: MessageCircle,
    role: "给家长",
    title: "看见孩子在课堂里的真实成长",
    description: "用更温和的方式了解孩子的学习状态，不只看结果，也能看到每一次尝试。",
    points: ["变化更直观", "沟通更轻松", "陪伴更有方向"],
    color: "from-warning to-warning-ink",
    bg: "from-warning-soft to-warning-soft",
  },
];

export const journeySteps: JourneyStep[] = [
  { icon: Compass, label: "STEP 01", title: "发现兴趣", description: "把课堂目标变成孩子愿意靠近的问题。" },
  { icon: ClipboardCheck, label: "STEP 02", title: "完成任务", description: "用清晰任务和即时反馈推动每一次尝试。" },
  { icon: Trophy, label: "STEP 03", title: "收获鼓励", description: "让努力、合作和创意都被认真看见。" },
  { icon: MessageCircle, label: "STEP 04", title: "持续成长", description: "把课堂瞬间沉淀成可以回看的成长记录。" },
];

export const classroomMoments: ClassroomMoment[] = [
  {
    icon: Target,
    label: "课前",
    title: "目标先被看见",
    description: "把今天要完成什么说明白，让孩子进入课堂前就知道方向。",
    details: ["目标卡片", "小组任务", "个人期待"],
    color: "text-info",
    bg: "bg-info-soft",
  },
  {
    icon: Sparkles,
    label: "课中",
    title: "鼓励在课堂里发生",
    description: "用即时反馈承接每一次尝试，让参与感持续升温。",
    details: ["积分鼓励", "同伴协作", "灵感记录"],
    color: "text-warning",
    bg: "bg-warning-soft",
  },
  {
    icon: BookOpen,
    label: "课后",
    title: "成长被整理下来",
    description: "把课堂瞬间沉淀成回看线索，方便老师复盘、家长理解。",
    details: ["成长回顾", "动态沉淀", "下一步建议"],
    color: "text-success",
    bg: "bg-success-soft",
  },
];

export const newsPreparations: string[] = ["课堂故事", "学习灵感", "成长瞬间"];
