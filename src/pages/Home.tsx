import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Eye,
  Lightbulb,
  MessageCircle,
  Newspaper,
  Phone,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import TypewriterText from "@/components/TypewriterText";
import WebsiteIcon from "@/components/WebsiteIcon";
import { portalApi } from "@/features/portal/api/portalApi";
import journeyLaunch from "@/assets/portal/journey-launch.png";
import learningWorld from "@/assets/portal/learning-world.png";

const quickLinks = [
  { icon: BookOpen, title: "关于我们", description: "认识我们的教育理念", link: "/about", color: "text-indigo-500", bg: "bg-indigo-50" },
  { icon: Users, title: "服务介绍", description: "发现有趣的课堂体验", link: "/services", color: "text-emerald-500", bg: "bg-emerald-50" },
  { icon: Newspaper, title: "最新动态", description: "了解正在发生的新鲜事", link: "/news", color: "text-amber-500", bg: "bg-amber-50" },
  { icon: Phone, title: "联系我们", description: "一起开启学习新旅程", link: "/contact", color: "text-violet-500", bg: "bg-violet-50" },
];

const learningHighlights = [
  { icon: Target, title: "目标清晰", description: "把每一步成长变得看得见", color: "text-indigo-500", bg: "bg-indigo-50" },
  { icon: Trophy, title: "即时鼓励", description: "让每一次进步都值得庆祝", color: "text-amber-500", bg: "bg-amber-50" },
  { icon: Lightbulb, title: "主动探索", description: "在好奇心里发现更多可能", color: "text-emerald-500", bg: "bg-emerald-50" },
];

const heroSignals = ["课堂更有参与感", "成长轨迹更清晰", "家校沟通更轻松"];

const audienceCards = [
  {
    icon: Sparkles,
    role: "给学生",
    title: "把学习变成一场愿意继续的探索",
    description: "用任务、奖励和成长记录，把看不见的努力变成可以被感受到的小成就。",
    points: ["目标更清楚", "反馈更及时", "成长更有仪式感"],
    color: "from-indigo-500 to-violet-500",
    bg: "from-indigo-50 to-violet-50",
  },
  {
    icon: ClipboardCheck,
    role: "给老师",
    title: "把课堂管理变得更轻、更有秩序",
    description: "把任务推进、学生状态和课堂激励集中起来，减少重复记录，让注意力回到教学本身。",
    points: ["任务可追踪", "表现可沉淀", "激励可持续"],
    color: "from-emerald-500 to-teal-500",
    bg: "from-emerald-50 to-teal-50",
  },
  {
    icon: MessageCircle,
    role: "给家长",
    title: "看见孩子在课堂里的真实成长",
    description: "用更温和的方式了解孩子的学习状态，不只看结果，也能看到每一次尝试。",
    points: ["变化更直观", "沟通更轻松", "陪伴更有方向"],
    color: "from-amber-500 to-orange-500",
    bg: "from-amber-50 to-orange-50",
  },
];

const journeySteps = [
  { icon: Compass, label: "STEP 01", title: "发现兴趣", description: "把课堂目标变成孩子愿意靠近的问题。" },
  { icon: ClipboardCheck, label: "STEP 02", title: "完成任务", description: "用清晰任务和即时反馈推动每一次尝试。" },
  { icon: Trophy, label: "STEP 03", title: "收获鼓励", description: "让努力、合作和创意都被认真看见。" },
  { icon: MessageCircle, label: "STEP 04", title: "持续成长", description: "把课堂瞬间沉淀成可以回看的成长记录。" },
];

const classroomMoments = [
  {
    icon: Target,
    label: "课前",
    title: "目标先被看见",
    description: "把今天要完成什么说明白，让孩子进入课堂前就知道方向。",
    details: ["目标卡片", "小组任务", "个人期待"],
    color: "text-indigo-500",
    bg: "bg-indigo-50",
  },
  {
    icon: Sparkles,
    label: "课中",
    title: "鼓励在课堂里发生",
    description: "用即时反馈承接每一次尝试，让参与感持续升温。",
    details: ["积分鼓励", "同伴协作", "灵感记录"],
    color: "text-violet-500",
    bg: "bg-violet-50",
  },
  {
    icon: BookOpen,
    label: "课后",
    title: "成长被整理下来",
    description: "把课堂瞬间沉淀成回看线索，方便老师复盘、家长理解。",
    details: ["成长回顾", "动态沉淀", "下一步建议"],
    color: "text-emerald-500",
    bg: "bg-emerald-50",
  },
];

const newsPreparations = ["课堂故事", "学习灵感", "成长瞬间"];

export default function Home() {
  const [homeData, setHomeData] = useState<any>({});
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [homeRes, articlesRes] = await Promise.all([
          portalApi.getHomeContent(),
          portalApi.getArticles({ is_published: true, limit: 3 }),
        ]);
        setHomeData(homeRes.data || {});
        setArticles(articlesRes.articles || []);
      } catch (err) {
        console.error("Failed to fetch homepage data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const about = homeData.about || {
    title: "让学习充满乐趣",
    content: "在这里，每个孩子都是独一无二的主角。",
  };

  return (
    <div className="public-campus-page min-h-screen bg-[var(--campus-canvas)] text-slate-800 selection:bg-emerald-100 selection:text-emerald-700 font-sans">
      {/* ---- Navigation ---- */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <WebsiteIcon className="h-9 w-9 rounded-lg object-cover" />
            <span>Think-Class</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden md:flex gap-8 font-medium text-slate-600 text-sm"
          >
            <Link to="/about" className="hover:text-indigo-600 transition-colors">
              关于我们
            </Link>
            <Link to="/services" className="hover:text-indigo-600 transition-colors">
              服务介绍
            </Link>
            <Link to="/news" className="hover:text-indigo-600 transition-colors">
              最新动态
            </Link>
            <Link to="/contact" className="hover:text-indigo-600 transition-colors">
              联系我们
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Link
              to="/login"
              className="px-5 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all shadow-sm shadow-indigo-500/20 inline-flex items-center gap-2"
            >
              开启旅程 <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-12 pt-20 md:pt-28 pb-8 overflow-hidden">
        <div className="absolute inset-x-12 top-10 h-72 opacity-50 pointer-events-none bg-[radial-gradient(circle_at_center,_rgba(99,102,241,0.12)_1px,_transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute left-1/2 top-52 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200/30 blur-3xl pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold mb-6">
            <Zap className="w-3.5 h-3.5" />
            全新学习体验
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight">
            <TypewriterText
              startDelay={350}
              speed={120}
              segments={[
                { text: "让教育" },
                {
                  text: " 充满乐趣 ",
                  className: "bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent",
                },
                { text: "与想象" },
              ]}
            />
          </h1>
          <p className="mt-6 text-lg text-slate-500 leading-relaxed max-w-xl mx-auto">
            <TypewriterText
              startDelay={2200}
              speed={55}
              segments={[
                { text: "通过游戏化课堂体验，激发每个孩子的学习热情与创造力。" },
              ]}
            />
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/login"
              className="px-8 py-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition-all shadow-sm shadow-indigo-500/20 inline-flex items-center gap-2"
            >
              立即开始 <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/about"
              className="px-8 py-3 rounded-xl bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-all border border-slate-200 shadow-sm"
            >
              了解更多
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {heroSignals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm shadow-indigo-100/40 backdrop-blur"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {signal}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="relative max-w-4xl mx-auto mt-8 md:mt-10"
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/50 shadow-[0_24px_80px_rgba(99,102,241,0.10)]">
            <img
              src={learningWorld}
              alt="书本、望远镜、积木与星星构成的探索学习世界"
              className="w-full aspect-[16/7] object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white/80 to-transparent pointer-events-none" />
          </div>
          <motion.div
            animate={shouldReduceMotion ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="hidden md:flex absolute left-3 top-1/3 -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg shadow-indigo-100/70 backdrop-blur"
          >
            <Sparkles className="h-4 w-4 text-indigo-500" />
            灵感随时发生
          </motion.div>
          <motion.div
            animate={shouldReduceMotion ? undefined : { y: [0, 8, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            className="hidden md:flex absolute right-3 bottom-1/4 translate-x-1/2 items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg shadow-indigo-100/70 backdrop-blur"
          >
            <BookOpen className="h-4 w-4 text-emerald-500" />
            每一步都有收获
          </motion.div>
        </motion.div>
      </section>

      {/* ---- Quick Links ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {quickLinks.map((item, idx) => (
            <Link key={idx} to={item.link} className="group">
              <div className="h-full p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col items-center text-center gap-3">
                <div className={`h-12 w-12 rounded-xl ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">{item.title}</h3>
                <p className="text-xs leading-relaxed text-slate-400">{item.description}</p>
              </div>
            </Link>
          ))}
        </motion.div>
      </section>

      {/* ---- Audience ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10 max-w-2xl"
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
            <Users className="h-3.5 w-3.5" />
            共同参与
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">让学生、老师和家长都在同一条成长线上</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            一个好的课堂体验，不只让孩子觉得有趣，也要让老师更好推进、让家长更容易理解孩子正在经历什么。
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3">
          {audienceCards.map((card, index) => (
            <motion.div
              key={card.role}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${card.bg} opacity-80`} />
              <div className="relative">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} text-white shadow-lg shadow-indigo-100/60`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-bold text-slate-500 shadow-sm backdrop-blur">
                    {card.role}
                  </span>
                </div>
                <h3 className="text-lg font-bold leading-snug text-slate-900">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{card.description}</p>
                <div className="mt-6 space-y-2">
                  {card.points.map((point) => (
                    <div key={point} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---- About ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 md:p-16 flex flex-col md:flex-row items-center gap-12"
        >
          <div className="flex-1 space-y-4">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{about.title}</h2>
            <p className="text-base text-slate-500 leading-relaxed whitespace-pre-wrap">{about.content}</p>
            <Link
              to="/about"
              className="mt-2 inline-flex items-center gap-1.5 text-indigo-500 font-semibold text-sm hover:text-indigo-600 transition-colors"
            >
              了解更多 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="w-full md:w-[44%] space-y-3">
            {learningHighlights.map((item) => (
              <div key={item.title} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3.5">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{item.title}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ---- Journey ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
              <Rocket className="h-3.5 w-3.5" />
              学习旅程
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900">从好奇出发，到成长被看见</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
              从第一次尝试到持续进步，每一步都有清晰节奏，让课堂体验更容易被理解、参与和坚持。
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative grid gap-4 md:grid-cols-4"
        >
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-12 hidden h-px bg-gradient-to-r from-transparent via-indigo-100 to-transparent md:block" />
          {journeySteps.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50">
                  <step.icon className="h-5 w-5 text-indigo-500" />
                </div>
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-slate-400">
                  {step.label}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.description}</p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
                  style={{ width: `${(index + 1) * 25}%` }}
                />
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ---- Classroom Moments ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:p-10"
        >
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-100/60 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-600">
                <Calendar className="h-3.5 w-3.5" />
                课堂场景
              </div>
              <h2 className="text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
                一节课，从进入状态到留下成长痕迹
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Think-Class 的细节不是把课堂变复杂，而是把关键瞬间整理清楚：开始前有方向，进行中有反馈，结束后有回看。
              </p>
              <div className="mt-7 grid grid-cols-3 gap-3">
                {["有目标", "有反馈", "有沉淀"].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-4 text-center">
                    <div className="mx-auto mb-2 h-2 w-2 rounded-full bg-indigo-400" />
                    <div className="text-xs font-bold text-slate-600">{item}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {classroomMoments.map((moment, index) => (
                <motion.div
                  key={moment.label}
                  initial={{ opacity: 0, x: 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white/85 p-5 shadow-sm backdrop-blur"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${moment.bg}`}>
                      <moment.icon className={`h-5 w-5 ${moment.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-400">
                          {moment.label}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">{moment.title}</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-500">{moment.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {moment.details.map((detail) => (
                          <span
                            key={detail}
                            className="rounded-full border border-slate-100 bg-white px-3 py-1 text-xs font-semibold text-slate-500"
                          >
                            {detail}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ---- News ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <div className="flex justify-between items-end mb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">最新动态</h2>
            <p className="text-slate-500 text-sm">探索发生的新鲜事</p>
          </motion.div>
          <Link
            to="/news"
            className="hidden sm:flex items-center text-indigo-500 font-semibold text-sm hover:text-indigo-600 transition-colors group"
          >
            查看全部动态 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-[380px] border border-slate-100" />
            ))}
          </div>
        ) : articles.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-6">
            {articles.map((article, idx) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => navigate("/news")}
                className="group cursor-pointer bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                <div className="relative h-52 overflow-hidden bg-slate-100">
                  {article.cover_image ? (
                    <img
                      src={article.cover_image}
                      alt={article.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                      <Newspaper className="w-14 h-14 group-hover:scale-110 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-semibold text-indigo-500 shadow-sm">
                    {article.category || "新闻"}
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-base font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-slate-500 text-sm line-clamp-3 mb-4 leading-relaxed flex-1">
                    {article.summary || "点击查看完整内容..."}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium pt-4 border-t border-slate-100">
                    <div className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1.5" />
                      {new Date(article.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                    <div className="flex items-center">
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      {article.view_count || 0} 次阅读
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-white via-white to-indigo-50/70 px-8 py-10 shadow-sm md:px-12">
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-100/60 blur-3xl" />
            <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-md">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
                  <Newspaper className="h-7 w-7 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">精彩内容正在准备中</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  新的课堂故事、学习灵感和成长瞬间，很快会在这里和大家见面。
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {newsPreparations.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="hidden w-72 space-y-3 sm:block" aria-hidden="true">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm backdrop-blur">
                    <div className="mb-2 h-2 w-20 rounded-full bg-indigo-100" />
                    <div className="h-2 rounded-full bg-slate-100" />
                    <div className="mt-2 h-2 w-3/4 rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="mt-8 text-center sm:hidden">
          <Link
            to="/news"
            className="inline-flex items-center text-indigo-500 font-semibold text-sm px-6 py-3 bg-white rounded-xl shadow-sm border border-slate-100"
          >
            查看全部动态 <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </section>

      {/* ---- Closing CTA ---- */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative min-h-[300px] overflow-hidden rounded-[2rem] border border-indigo-100 bg-indigo-50/80 shadow-sm"
        >
          <img
            src={journeyLaunch}
            alt=""
            className="absolute bottom-0 right-0 h-full w-full object-cover object-right-bottom opacity-25 [mask-image:linear-gradient(to_bottom,transparent_8%,black_56%)] sm:opacity-35 md:inset-y-0 md:w-[68%] md:object-right md:opacity-100 md:[mask-image:linear-gradient(to_left,black_55%,transparent_94%)]"
          />
          <div className="relative z-10 flex min-h-[300px] max-w-xl flex-col justify-center px-6 py-10 md:px-14 md:py-12">
            <div className="rounded-[1.5rem] bg-white/75 p-6 shadow-sm shadow-indigo-100/50 backdrop-blur-sm md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
              <h2 className="text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
                让每一次学习，都成为新的发现
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500 md:text-base">
                从今天开始，用更有趣的方式记录成长、鼓励探索，也让课堂里的每一个闪光时刻被看见。
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition-colors hover:bg-indigo-600"
                >
                  开启旅程 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                >
                  联系我们 <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <WebsiteIcon className="h-4 w-4 rounded object-cover" />
            Think-Class &copy; {new Date().getFullYear()}
          </div>
          <div className="flex gap-6 text-sm text-slate-400">
            <Link to="/about" className="hover:text-slate-600 transition-colors">关于</Link>
            <Link to="/contact" className="hover:text-slate-600 transition-colors">联系</Link>
            <Link to="/news" className="hover:text-slate-600 transition-colors">动态</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
