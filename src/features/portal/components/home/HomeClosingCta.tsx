import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import journeyLaunch from "@/assets/portal/journey-launch.png";

/**
 * Closing call to action.
 *
 * The illustration is decorative and stays behind `alt=""` with its own mask, so the
 * gradient falloff over the primary panel is not announced to screen readers.
 */
export default function HomeClosingCta() {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative min-h-[300px] overflow-hidden rounded-panel border border-line-1 bg-surface-3 shadow-sm"
      >
        <img
          src={journeyLaunch}
          alt=""
          className="absolute bottom-0 right-0 h-full w-full object-cover object-right-bottom opacity-25 [mask-image:linear-gradient(to_bottom,transparent_8%,black_56%)] sm:opacity-35 md:inset-y-0 md:w-[68%] md:object-right md:opacity-100 md:[mask-image:linear-gradient(to_left,black_55%,transparent_94%)]"
        />
        <div className="relative z-10 flex min-h-[300px] max-w-xl flex-col justify-center px-6 py-10 md:px-14 md:py-12">
          <div className="rounded-card bg-surface-2/85 p-6 shadow-sm backdrop-blur-sm md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
            <h2 className="text-2xl font-bold leading-tight text-fg-1 md:text-3xl">
              让每一次学习，都成为新的发现
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-2 md:text-base">
              从今天开始，用更有趣的方式记录成长、鼓励探索，也让课堂里的每一个闪光时刻被看见。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-brand-contrast shadow-sm transition-colors hover:bg-brand-strong"
              >
                开启旅程 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2 transition-colors hover:text-brand"
              >
                联系我们 <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
