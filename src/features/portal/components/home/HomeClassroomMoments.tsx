import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { classroomMoments } from "./homeContent";

/**
 * Classroom moments: the before/during/after breakdown of a single lesson.
 *
 * The three moments slide in from the right with the same `index * 0.08` stagger, so the
 * timeline still reads top-to-bottom in the order the labels promise.
 */
export default function HomeClassroomMoments() {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-panel border border-border bg-paper p-6 shadow-sm md:p-10"
      >
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              <Calendar className="h-3.5 w-3.5" />
              课堂场景
            </div>
            <h2 className="text-2xl font-bold leading-tight text-ink-1 md:text-3xl">
              一节课，从进入状态到留下成长痕迹
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-3">
              Think-Class 的细节不是把课堂变复杂，而是把关键瞬间整理清楚：开始前有方向，进行中有反馈，结束后有回看。
            </p>
            <div className="mt-7 grid grid-cols-3 gap-3">
              {["有目标", "有反馈", "有沉淀"].map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-muted px-3 py-4 text-center">
                  <div className="mx-auto mb-2 h-2 w-2 rounded-full bg-primary/60" />
                  <div className="text-xs font-bold text-ink-2">{item}</div>
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
                className="relative overflow-hidden rounded-3xl border border-border bg-paper/85 p-5 shadow-sm backdrop-blur"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${moment.bg}`}>
                    <moment.icon className={`h-5 w-5 ${moment.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-muted/50 px-2.5 py-1 text-[11px] font-bold text-ink-3">
                        {moment.label}
                      </span>
                      <h3 className="text-base font-bold text-ink-1">{moment.title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-ink-3">{moment.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {moment.details.map((detail) => (
                        <span
                          key={detail}
                          className="rounded-full border border-border bg-paper px-3 py-1 text-xs font-semibold text-ink-3"
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
  );
}
