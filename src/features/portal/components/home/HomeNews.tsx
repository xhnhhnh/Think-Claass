import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Calendar, CheckCircle2, ChevronRight, Eye, Newspaper } from "lucide-react";
import { newsPreparations } from "./homeContent";

interface HomeNewsProps {
  loading: boolean;
  articles: any[];
  onOpenNews: () => void;
}

/**
 * News strip: the three latest articles, or the "content in preparation" panel when there
 * are none.
 *
 * `loading` and `articles` stay page state — the fetch that fills them lives in the page,
 * so this component only decides which of the three states to draw and never fetches by itself.
 */
export default function HomeNews({ loading, articles, onOpenNews }: HomeNewsProps) {
  return (
    <section className="max-w-7xl mx-auto px-6 md:px-12 py-16">
      <div className="flex justify-between items-end mb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl md:text-3xl font-bold text-ink-1 mb-2">最新动态</h2>
          <p className="text-ink-3 text-sm">探索发生的新鲜事</p>
        </motion.div>
        <Link
          to="/news"
          className="hidden sm:flex items-center text-primary font-semibold text-sm hover:text-primary transition-colors group"
        >
          查看全部动态 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-paper rounded-2xl h-[380px] border border-border" />
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
              onClick={onOpenNews}
              className="group cursor-pointer bg-paper rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              <div className="relative h-52 overflow-hidden bg-muted">
                {article.cover_image ? (
                  <img
                    src={article.cover_image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-ink-3/60">
                    <Newspaper className="w-14 h-14 group-hover:scale-110 transition-transform duration-500" />
                  </div>
                )}
                <div className="absolute top-3 left-3 bg-paper/90 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-semibold text-primary shadow-sm">
                  {article.category || "新闻"}
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-base font-bold text-ink-1 mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                  {article.title}
                </h3>
                <p className="text-ink-3 text-sm line-clamp-3 mb-4 leading-relaxed flex-1">
                  {article.summary || "点击查看完整内容..."}
                </p>
                <div className="flex items-center justify-between text-xs text-ink-3 font-medium pt-4 border-t border-border">
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
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-paper via-paper to-primary/5 px-8 py-10 shadow-sm md:px-12">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary blur-3xl" />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-md">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5">
                <Newspaper className="h-7 w-7 text-primary/70" />
              </div>
              <h3 className="text-lg font-bold text-ink-1">精彩内容正在准备中</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">
                新的课堂故事、学习灵感和成长瞬间，很快会在这里和大家见面。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {newsPreparations.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-ink-3 shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary/70" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden w-72 space-y-3 sm:block" aria-hidden="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-xl border border-white/80 bg-paper/80 p-3 shadow-sm backdrop-blur">
                  <div className="mb-2 h-2 w-20 rounded-full bg-primary/10" />
                  <div className="h-2 rounded-full bg-muted" />
                  <div className="mt-2 h-2 w-3/4 rounded-full bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="mt-8 text-center sm:hidden">
        <Link
          to="/news"
          className="inline-flex items-center text-primary font-semibold text-sm px-6 py-3 bg-paper rounded-xl shadow-sm border border-border"
        >
          查看全部动态 <ChevronRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
    </section>
  );
}
