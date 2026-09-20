import { useState, useEffect } from "react";
import { BookOpen, Heart, Star } from "lucide-react";
import { motion } from "framer-motion";

import { portalApi } from "@/features/portal/api/portalApi";
import PortalShell from "@/features/portal/components/PortalShell";
import { Spinner } from "@/components/ui/spinner";

/**
 * 关于我们.
 *
 * Zeros out the page's indigo/violet: the hero gradient, the two feature cards and
 * the loading spinner all come from tokens now, so this page and the rest of the
 * product are the same colour family.
 */
export default function AboutPage() {
  const [aboutData, setAboutData] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAboutData = async () => {
      try {
        const data = await portalApi.getHomeContent();
        if (data.success && data.data.about) {
          setAboutData({ title: data.data.about.title || "", content: data.data.about.content || "" });
        }
      } catch (error) {
        console.error("获取关于我们数据失败:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAboutData();
  }, []);

  return (
    <PortalShell title="关于我们" icon={BookOpen} mainClassName="max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-panel border border-border bg-paper shadow-card"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent px-8 py-16 text-center">
          <div className="relative z-10">
            <h1 className="mb-3 text-3xl font-bold text-ink-1 md:text-4xl">
              {aboutData?.title || "致力于更好的教育管理"}
            </h1>
            <p className="mx-auto max-w-2xl text-base text-ink-3">
              通过科技赋能教育，让家校沟通更顺畅，让班级管理更高效。
            </p>
          </div>
        </div>

        <div className="p-8 md:p-12">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" label="正在加载关于我们" className="text-primary" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="prose prose-slate max-w-none leading-relaxed whitespace-pre-line text-ink-2"
            >
              {aboutData?.content || "暂无关于我们内容的详细介绍。请在后台管理系统中添加。"}
            </motion.div>
          )}

          <div className="mt-12 grid gap-5 border-t border-border pt-10 md:grid-cols-2">
            <motion.div
              whileHover={{ y: -2 }}
              className="rounded-panel border border-primary/10 bg-primary/5 p-7 transition-all"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-card bg-primary text-primary-foreground">
                <Heart className="size-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-ink-1">家校共育</h3>
              <p className="text-sm leading-relaxed text-ink-3">
                打破信息孤岛，实现教师与家长之间的无缝对接，共同关注孩子的成长与发展。
              </p>
            </motion.div>
            <motion.div
              whileHover={{ y: -2 }}
              className="rounded-panel border border-warning/20 bg-warning/10 p-7 transition-all"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-card bg-warning text-primary-foreground">
                <Star className="size-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-ink-1">科学评价</h3>
              <p className="text-sm leading-relaxed text-ink-3">
                多维度的学生评价体系，发现每个孩子的闪光点，激发内在学习动力。
              </p>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </PortalShell>
  );
}
