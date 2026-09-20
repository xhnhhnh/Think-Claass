import { motion } from "framer-motion";
import { CheckCircle2, Users } from "lucide-react";
import { audienceCards } from "./homeContent";

/**
 * Audience: one card each for students, teachers and parents.
 *
 * Every card keeps `index * 0.08` as its stagger so the three cards still cascade in the
 * same order and at the same speed as before the split.
 */
export default function HomeAudience() {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-10 max-w-2xl"
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
          <Users className="h-3.5 w-3.5" />
          共同参与
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-ink-1">让学生、老师和家长都在同一条成长线上</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">
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
            className="group relative overflow-hidden rounded-3xl border border-border bg-paper p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${card.bg} opacity-80`} />
            <div className="relative">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} text-white shadow-lg shadow-primary/10`}>
                  <card.icon className="h-6 w-6" />
                </div>
                <span className="rounded-full border border-white/80 bg-paper/80 px-3 py-1 text-xs font-bold text-ink-3 shadow-sm backdrop-blur">
                  {card.role}
                </span>
              </div>
              <h3 className="text-lg font-bold leading-snug text-ink-1">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-3">{card.description}</p>
              <div className="mt-6 space-y-2">
                {card.points.map((point) => (
                  <div key={point} className="flex items-center gap-2 text-sm font-medium text-ink-2">
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
  );
}
