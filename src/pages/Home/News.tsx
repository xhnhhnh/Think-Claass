import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Newspaper, Calendar, Eye, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet } from "@/lib/api";

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
        const data = await apiGet('/api/website/articles?is_published=true&limit=20');
        if (data.success) {
          setArticles(data.articles);
        }
      } catch (error) {
        console.error('获取新闻动态失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);

  const handleReadMore = async (id: number) => {
    setArticleLoading(true);
    try {
      const data = await apiGet(`/api/website/articles/${id}`);
      if (data.success) {
        setSelectedArticle(data.article);
      }
    } catch (error) {
      console.error('获取文章详情失败:', error);
    } finally {
      setArticleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfaf5] text-[#5c4b3a] selection:bg-[#f2c779] selection:text-white font-sans overflow-hidden relative flex flex-col">
      {/* Background Texture Overlay */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-0" 
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Header */}
      <header className="relative z-10 bg-white/50 backdrop-blur-md border-b border-[#f0e6d3] sticky top-0">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center space-x-2 text-[#d97757]"
          >
            <Newspaper className="w-6 h-6" />
            <span className="text-xl font-bold tracking-wide">新闻动态</span>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="flex items-center text-[#7d6b5a] hover:text-[#d97757] transition-colors font-medium bg-white px-4 py-2 rounded-full shadow-sm border border-[#f0e6d3]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </motion.button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#4a3b2c] mb-6">最新动态</h1>
          <p className="text-lg text-[#7d6b5a] max-w-2xl mx-auto leading-relaxed">
            了解系统的最新功能发布、教育资讯和成功案例分享。
          </p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#d97757]"></div>
          </div>
        ) : articles.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-white rounded-3xl border border-[#f0e6d3] shadow-sm"
          >
            <div className="mx-auto w-24 h-24 bg-[#fdf4f1] rounded-full flex items-center justify-center mb-6">
              <FileText className="w-12 h-12 text-[#d97757] opacity-50" />
            </div>
            <h3 className="text-2xl font-bold text-[#4a3b2c] mb-3">暂无新闻内容</h3>
            <p className="text-[#7d6b5a]">我们正在准备更多精彩内容，敬请期待！</p>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((article, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={article.id} 
                className="bg-white rounded-3xl shadow-sm border border-[#f0e6d3] overflow-hidden hover:shadow-xl hover:shadow-[#d97757]/10 transition-all duration-300 transform hover:-translate-y-2 flex flex-col cursor-pointer group"
                onClick={() => handleReadMore(article.id)}
              >
                {article.cover_image ? (
                  <div className="h-52 overflow-hidden bg-[#fcfaf5]">
                    <img 
                      src={article.cover_image} 
                      alt={article.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="h-52 bg-[#fdf4f1] flex items-center justify-center border-b border-[#f0e6d3]">
                    <Newspaper className="w-16 h-16 text-[#d97757]/20" />
                  </div>
                )}
                
                <div className="p-8 flex-1 flex flex-col">
                  <div className="flex items-center space-x-4 mb-4 text-xs font-medium text-[#bbaea0]">
                    {article.category && (
                      <span className="px-3 py-1 bg-[#f1f8f5] text-[#8fb9a8] rounded-full">
                        {article.category}
                      </span>
                    )}
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1.5" />
                      {new Date(article.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold text-[#4a3b2c] mb-3 line-clamp-2 leading-snug group-hover:text-[#d97757] transition-colors">
                    {article.title}
                  </h3>
                  
                  <p className="text-[#7d6b5a] mb-6 line-clamp-3 text-sm flex-1 leading-relaxed">
                    {article.summary || '点击阅读完整内容...'}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto pt-5 border-t border-[#f0e6d3]">
                    <div className="flex items-center text-[#bbaea0] text-sm">
                      <Eye className="w-4 h-4 mr-1.5" />
                      {article.view_count} 次阅读
                    </div>
                    <span className="text-[#d97757] font-medium text-sm group-hover:underline flex items-center">
                      阅读全文 <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Article Modal */}
      <AnimatePresence>
        {selectedArticle && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4a3b2c]/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#fcfaf5] rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh] border border-[#f0e6d3]"
            >
              {/* Header / Banner */}
              <div className="relative shrink-0">
                {selectedArticle.cover_image ? (
                  <div className="h-64 md:h-80 w-full overflow-hidden">
                    <img 
                      src={selectedArticle.cover_image} 
                      alt={selectedArticle.title} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#4a3b2c]/80 to-transparent"></div>
                  </div>
                ) : (
                  <div className="h-32 bg-[#fdf4f1]"></div>
                )}
                
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="absolute top-6 right-6 p-2.5 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-colors z-10 shadow-sm"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className={`px-8 pt-8 pb-6 ${selectedArticle.cover_image ? 'absolute bottom-0 left-0 right-0 text-white' : 'text-[#4a3b2c]'}`}>
                  <div className="flex items-center space-x-4 mb-4 text-sm font-medium opacity-90">
                    {selectedArticle.category && (
                      <span className={`px-3 py-1 rounded-full ${selectedArticle.cover_image ? 'bg-white/20 backdrop-blur-md text-white' : 'bg-[#f1f8f5] text-[#8fb9a8]'}`}>
                        {selectedArticle.category}
                      </span>
                    )}
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1.5" />
                      {new Date(selectedArticle.created_at).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <Eye className="w-4 h-4 mr-1.5" />
                      {selectedArticle.view_count}
                    </div>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
                    {selectedArticle.title}
                  </h2>
                </div>
              </div>

              {/* Article Content */}
              <div className="p-8 md:p-12 overflow-y-auto bg-white">
                {articleLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d97757]"></div>
                  </div>
                ) : (
                  <div 
                    className="prose prose-lg max-w-none text-[#5c4b3a] leading-relaxed whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
                  />
                )}
              </div>
              
              <div className="p-6 bg-[#fcfaf5] border-t border-[#f0e6d3] flex justify-center">
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="px-8 py-3 bg-white border border-[#f0e6d3] text-[#7d6b5a] rounded-xl hover:text-[#d97757] hover:border-[#d97757] transition-colors font-medium shadow-sm"
                >
                  关闭文章
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="relative z-10 bg-white/80 border-t border-[#f0e6d3] text-[#7d6b5a] py-8 text-center mt-auto">
        <p>© {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
