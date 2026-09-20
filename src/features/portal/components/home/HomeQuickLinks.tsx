import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { quickLinks } from "./homeContent";

/**
 * Quick links: the four entry cards straight after the hero.
 *
 * The grid animates as one block rather than per card — that is how it reads today, so the
 * single `whileInView` wrapper is kept around the whole grid instead of the individual links.
 */
export default function HomeQuickLinks() {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {quickLinks.map((item, idx) => (
          <Link key={idx} to={item.link} className="group">
            <div className="h-full p-6 rounded-2xl bg-paper border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col items-center text-center gap-3">
              <div className={`h-12 w-12 rounded-xl ${item.bg} flex items-center justify-center`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
              <h3 className="text-sm font-semibold text-ink-1">{item.title}</h3>
              <p className="text-xs leading-relaxed text-ink-3">{item.description}</p>
            </div>
          </Link>
        ))}
      </motion.div>
    </section>
  );
}
