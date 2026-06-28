import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Newspaper, Calendar, Eye, FileText, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { portalApi } from "@/features/portal/api/portalApi";

interface Article {
  id: number;
  title: string;
  summary: string;
  content: string;
  cover_image: string;
  category: string;
  view_count: number;
  created_at: string;
}

export default function HomeNews() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const data = await portalApi.getArticles({ is_published: true, limit: 20 });
        if (data.success) setArticles(data.articles);
      } catch (error) {
        console.error("获取新闻动态失败:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);

  const handleReadMore = async (id: number) => {
    setArticleLoading(true);
    try {
      const data = await portalApi.getArticle(id);
      if (data.success) setSelectedArticle(data.article);
    } catch (error) {
      console.error("获取文章详情失败:", error);
    } finally {
      setArticleLoading(false);
    }
  };

  return (
    <div className="public-campus-page flex min-h-screen flex-col bg-[var(--campus-canvas)] text-slate-800 selection:bg-emerald-100 selection:text-emerald-700 font-sans">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900">新闻动态</span>
          </motion.div>
          <motion.button initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} onClick={() => navigate(-1)}
            className="flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
            <ArrowLeft className="w-4 h-4 mr-1.5" />返回首页
          </motion.button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">最新动态</h1>
          <p className="text-base text-slate-500 max-w-xl mx-auto">了解系统的最新功能发布、教育资讯和成功案例分享。</p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-500" /></div>
        ) : articles.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="mx-auto w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-5"><FileText className="w-10 h-10 text-slate-300" /></div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">暂无新闻内容</h3>
            <p className="text-slate-500 text-sm">我们正在准备更多精彩内容，敬请期待！</p>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article, idx) => (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }} key={article.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 overflow-hidden flex flex-col cursor-pointer group"
                onClick={() => handleReadMore(article.id)}>
                {article.cover_image ? (
                  <div className="h-48 overflow-hidden bg-slate-100"><img src={article.cover_image} alt={article.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" /></div>
                ) : (
                  <div className="h-48 bg-slate-50 flex items-center justify-center"><Newspaper className="w-12 h-12 text-slate-200" /></div>
                )}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-3 mb-3 text-xs font-medium text-slate-400">
                    {article.category && <span className="px-2.5 py-1 bg-indigo-50 text-indigo-500 rounded-lg">{article.category}</span>}
                    <div className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" />{new Date(article.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</div>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">{article.title}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-3 flex-1 leading-relaxed">{article.summary || "点击阅读完整内容..."}</p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                    <div className="flex items-center text-xs text-slate-400"><Eye className="w-3.5 h-3.5 mr-1" />{article.view_count} 次阅读</div>
                    <span className="text-xs text-indigo-500 font-medium group-hover:underline">阅读全文</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <AnimatePresence>
        {selectedArticle && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100">
              <div className="relative shrink-0">
                {selectedArticle.cover_image ? (
                  <div className="h-56 md:h-72 w-full overflow-hidden"><img src={selectedArticle.cover_image} alt={selectedArticle.title} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" /></div>
                ) : (<div className="h-20 bg-slate-50" />)}
                <button onClick={() => setSelectedArticle(null)} className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-lg text-white transition-colors z-10"><X className="w-5 h-5" /></button>
                <div className={`px-8 pt-6 pb-4 ${selectedArticle.cover_image ? "absolute bottom-0 left-0 right-0 text-white" : "text-slate-900"}`}>
                  <div className="flex items-center gap-3 mb-3 text-xs font-medium opacity-90">
                    {selectedArticle.category && (<span className={`px-2.5 py-1 rounded-lg ${selectedArticle.cover_image ? "bg-white/20 backdrop-blur-md text-white" : "bg-indigo-50 text-indigo-500"}`}>{selectedArticle.category}</span>)}
                    <div className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" />{new Date(selectedArticle.created_at).toLocaleDateString()}</div>
                    <div className="flex items-center"><Eye className="w-3.5 h-3.5 mr-1" />{selectedArticle.view_count}</div>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold leading-tight">{selectedArticle.title}</h2>
                </div>
              </div>
              <div className="p-8 md:p-10 overflow-y-auto">
                {articleLoading ? (<div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" /></div>)
                  : (<div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />)}
              </div>
              <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button onClick={() => setSelectedArticle(null)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:text-indigo-600 hover:border-indigo-200 transition-colors text-sm font-medium shadow-sm">关闭文章</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="border-t border-slate-100 bg-white py-6 text-center">
        <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
