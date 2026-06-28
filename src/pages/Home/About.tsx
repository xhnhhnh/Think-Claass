import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Heart, Star } from "lucide-react";
import { motion } from "framer-motion";

import { portalApi } from "@/features/portal/api/portalApi";

export default function HomeAbout() {
  const navigate = useNavigate();
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
    <div className="public-campus-page flex min-h-screen flex-col bg-[var(--campus-canvas)] text-slate-800 selection:bg-emerald-100 selection:text-emerald-700 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900">关于我们</span>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            返回首页
          </motion.button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
        >
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 px-8 py-16 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-200/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-200/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3 relative z-10">
              {aboutData?.title || "致力于更好的教育管理"}
            </h1>
            <p className="text-slate-500 text-base max-w-2xl mx-auto relative z-10">
              通过科技赋能教育，让家校沟通更顺畅，让班级管理更高效。
            </p>
          </div>

          <div className="p-8 md:p-12">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line"
              >
                {aboutData?.content || "暂无关于我们内容的详细介绍。请在后台管理系统中添加。"}
              </motion.div>
            )}

            <div className="grid md:grid-cols-2 gap-5 mt-12 pt-10 border-t border-slate-100">
              <motion.div whileHover={{ y: -2 }} className="bg-indigo-50/50 p-7 rounded-xl border border-indigo-100/50 transition-all">
                <div className="h-10 w-10 rounded-lg bg-indigo-500 flex items-center justify-center mb-3">
                  <Heart className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">家校共育</h3>
                <p className="text-sm text-slate-500 leading-relaxed">打破信息孤岛，实现教师与家长之间的无缝对接，共同关注孩子的成长与发展。</p>
              </motion.div>
              <motion.div whileHover={{ y: -2 }} className="bg-amber-50/50 p-7 rounded-xl border border-amber-100/50 transition-all">
                <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center mb-3">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">科学评价</h3>
                <p className="text-sm text-slate-500 leading-relaxed">多维度的学生评价体系，发现每个孩子的闪光点，激发内在学习动力。</p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-slate-100 bg-white py-6 text-center">
        <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
