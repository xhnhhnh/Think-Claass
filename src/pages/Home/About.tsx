import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Users, Star, Heart } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HomeAbout() {
  const navigate = useNavigate();
  const [aboutData, setAboutData] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAboutData = async () => {
      try {
        const res = await fetch('/api/website/home');
        const data = await res.json();
        if (data.success && data.data.about) {
          setAboutData(data.data.about);
        }
      } catch (error) {
        console.error('获取关于我们数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAboutData();
  }, []);

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
            <BookOpen className="w-6 h-6" />
            <span className="text-xl font-bold tracking-wide">关于我们</span>
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
      <main className="relative z-10 flex-1 max-w-4xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-[#f0e6d3]"
        >
          <div className="bg-[#fdf4f1] px-8 py-16 text-center relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-[#f2c779] rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-pulse"></div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#8fb9a8] rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-pulse animation-delay-2000"></div>
            
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-[#4a3b2c] relative z-10">
              {aboutData?.title || '致力于更好的教育管理'}
            </h1>
            <p className="text-[#7d6b5a] text-lg max-w-2xl mx-auto relative z-10">
              通过科技赋能教育，让家校沟通更顺畅，让班级管理更高效。
            </p>
          </div>

          <div className="p-8 md:p-12">
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d97757]"></div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="prose prose-lg max-w-none text-[#5c4b3a] leading-relaxed whitespace-pre-line"
              >
                {aboutData?.content || '暂无关于我们内容的详细介绍。请在后台管理系统中添加。'}
              </motion.div>
            )}

            {/* Feature Cards */}
            <div className="grid md:grid-cols-2 gap-6 mt-16 pt-12 border-t border-[#f0e6d3]">
              <motion.div 
                whileHover={{ y: -5 }}
                className="bg-[#f1f8f5] p-8 rounded-3xl border border-transparent hover:border-[#8fb9a8] transition-all"
              >
                <Heart className="w-10 h-10 text-[#8fb9a8] mb-4" />
                <h3 className="text-xl font-bold text-[#4a3b2c] mb-3">家校共育</h3>
                <p className="text-[#7d6b5a] leading-relaxed">打破信息孤岛，实现教师与家长之间的无缝对接，共同关注孩子的成长与发展。</p>
              </motion.div>
              <motion.div 
                whileHover={{ y: -5 }}
                className="bg-[#fcf8f0] p-8 rounded-3xl border border-transparent hover:border-[#e8b560] transition-all"
              >
                <Star className="w-10 h-10 text-[#e8b560] mb-4" />
                <h3 className="text-xl font-bold text-[#4a3b2c] mb-3">科学评价</h3>
                <p className="text-[#7d6b5a] leading-relaxed">多维度的学生评价体系，发现每个孩子的闪光点，激发内在学习动力。</p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-white/80 border-t border-[#f0e6d3] text-[#7d6b5a] py-8 text-center mt-auto">
        <p>© {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
