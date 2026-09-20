import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Sparkles, Zap } from "lucide-react";
import TypewriterText from "@/components/TypewriterText";
import { heroSignals } from "./homeContent";
import learningWorld from "@/assets/portal/learning-world.png";

interface HomeHeroProps {
  shouldReduceMotion: boolean | null;
}

/**
 * Hero: the two typewriter headlines, the primary calls to action and the floating
 * "inspiration" cards around the learning-world image.
 *
 * Both floating cards keep their `animate`/`transition` pair and only swap the target
 * for `undefined` under reduced motion, so the entrance timings stay untouched.
 */
export default function HomeHero({ shouldReduceMotion }: HomeHeroProps) {
  return (
    <section className="relative max-w-7xl mx-auto px-6 md:px-12 pt-20 md:pt-28 pb-8 overflow-hidden">
      <div className="absolute inset-x-12 top-10 h-72 opacity-50 pointer-events-none bg-[radial-gradient(circle_at_center,_hsl(var(--primary)/0.15)_1px,_transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="absolute left-1/2 top-52 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="text-center max-w-3xl mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 text-primary text-xs font-semibold mb-6">
          <Zap className="w-3.5 h-3.5" />
          全新学习体验
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-ink-1 leading-tight tracking-tight">
          <TypewriterText
            startDelay={350}
            speed={120}
            segments={[
              { text: "让教育" },
              {
                text: " 充满乐趣 ",
                className: "bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent",
              },
              { text: "与想象" },
            ]}
          />
        </h1>
        <p className="mt-6 text-lg text-ink-3 leading-relaxed max-w-xl mx-auto">
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
            className="px-8 py-3 rounded-xl bg-primary/50 text-white font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 inline-flex items-center gap-2"
          >
            立即开始 <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/about"
            className="px-8 py-3 rounded-xl bg-paper text-ink-2 font-semibold hover:bg-muted/60 transition-all border border-border shadow-sm"
          >
            了解更多
          </Link>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {heroSignals.map((signal) => (
            <span
              key={signal}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-paper/70 px-3 py-1.5 text-xs font-medium text-ink-3 shadow-sm shadow-primary/10 backdrop-blur"
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
        <div className="relative overflow-hidden rounded-panel border border-white/80 bg-paper/50 shadow-raised">
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
          className="hidden md:flex absolute left-3 top-1/3 -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/80 bg-paper/85 px-4 py-3 text-sm font-semibold text-ink-2 shadow-lg shadow-primary/10 backdrop-blur"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          灵感随时发生
        </motion.div>
        <motion.div
          animate={shouldReduceMotion ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          className="hidden md:flex absolute right-3 bottom-1/4 translate-x-1/2 items-center gap-2 rounded-2xl border border-white/80 bg-paper/85 px-4 py-3 text-sm font-semibold text-ink-2 shadow-lg shadow-primary/10 backdrop-blur"
        >
          <BookOpen className="h-4 w-4 text-emerald-500" />
          每一步都有收获
        </motion.div>
      </motion.div>
    </section>
  );
}
