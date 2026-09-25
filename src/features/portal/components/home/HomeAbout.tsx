import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { learningHighlights } from "./homeContent";

interface HomeAboutProps {
  about: { title: string; content: string };
}

/**
 * About: the fetched intro copy on the left, the three learning highlights on the right.
 *
 * `about` arrives as a prop because the page owns the fetch and its fallback copy; the
 * highlight list is static, so it comes straight from `homeContent`.
 */
export default function HomeAbout({ about }: HomeAboutProps) {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-surface-2 rounded-2xl border border-line-1 shadow-sm p-10 md:p-16 flex flex-col md:flex-row items-center gap-12"
      >
        <div className="flex-1 space-y-4">
          <h2 className="text-2xl md:text-3xl font-bold text-fg-1">{about.title}</h2>
          <p className="text-base text-fg-3 leading-relaxed whitespace-pre-wrap">{about.content}</p>
          <Link
            to="/about"
            className="mt-2 inline-flex items-center gap-1.5 text-role font-semibold text-sm hover:text-role transition-colors"
          >
            了解更多 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="w-full md:w-[44%] space-y-3">
          {learningHighlights.map((item) => (
            <div key={item.title} className="flex items-center gap-4 rounded-2xl border border-line-1 bg-surface-3 px-4 py-3.5">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-fg-1">{item.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
