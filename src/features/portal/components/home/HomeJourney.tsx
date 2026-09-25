import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { journeySteps } from "./homeContent";

const stepTones = [
  { icon: 'bg-info-soft text-info', progress: 'bg-info' },
  { icon: 'bg-success-soft text-success', progress: 'bg-success' },
  { icon: 'bg-warning-soft text-warning', progress: 'bg-warning' },
  { icon: 'bg-participation-soft text-participation', progress: 'bg-participation' },
] as const;

/**
 * Journey: the four numbered steps from curiosity to visible growth.
 *
 * The connector line and the per-step progress bars derive their position and width from
 * the step index, so the list stays a single mapped array rather than four hand-written blocks.
 */
export default function HomeJourney() {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
            <Rocket className="h-3.5 w-3.5" />
            学习旅程
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-fg-1">从好奇出发，到成长被看见</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-3">
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
        <div className="pointer-events-none absolute left-[12%] right-[12%] top-12 hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block" />
        {journeySteps.map((step, index) => (
          <div
            key={step.title}
            className="relative rounded-2xl border border-line-1 bg-surface-2 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stepTones[index].icon}`}>
                <step.icon className="h-5 w-5" />
              </div>
              <span className="rounded-full bg-surface-3/50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-fg-3">
                {step.label}
              </span>
            </div>
            <h3 className="text-base font-bold text-fg-1">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-3">{step.description}</p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${stepTones[index].progress}`}
                style={{ width: `${(index + 1) * 25}%` }}
              />
            </div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
