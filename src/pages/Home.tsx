import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Users, Phone, Newspaper, ArrowRight, Heart, Calendar, Eye, ChevronRight } from 'lucide-react';
import { apiGet } from '@/lib/api';

export default function Home() {
  const [homeData, setHomeData] = useState<any>({});
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [homeRes, articlesRes] = await Promise.all([
          apiGet<{ data?: any }>('/api/website/home'),
          apiGet<{ articles?: any[] }>('/api/website/articles?is_published=true&limit=3')
        ]);
        setHomeData(homeRes.data || {});
        setArticles(articlesRes.articles || []);
      } catch (err) {
        console.error('Failed to fetch homepage data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const hero = homeData.hero || {
    title: "在温暖中陪伴成长",
    subtitle: "我们致力于打造一个如童话般温馨的教育平台。连接教师、学生与家长，让每一次学习都像翻开一本精彩的故事书。",
    buttonText: "学生登录",
    buttonLink: "/login"
  };

  const about = homeData.about || {
    title: "了解我们的教育理念",
    content: "在这里，每个孩子都是独一无二的主角。"
  };

  return (
    <div className="min-h-screen bg-[#fcfaf5] text-[#5c4b3a] selection:bg-[#f2c779] selection:text-white font-sans overflow-hidden relative">
      {/* Background Texture Overlay */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-50" 
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Background Decor Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-[#f2e9d8] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-pulse" style={{ animationDuration: '8s' }}></div>
      <div className="absolute top-[20%] right-[-5%] w-[30vw] h-[30vw] bg-[#e8f1ed] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }}></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[35vw] h-[35vw] bg-[#fdf4f1] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-pulse" style={{ animationDuration: '9s', animationDelay: '2s' }}></div>

      {/* Navigation */}
      <nav className="relative z-40 w-full px-6 py-6 md:px-12 flex justify-between items-center max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#d97757] cursor-pointer"
          onClick={() => navigate('/')}
        >
          <Heart className="w-8 h-8 fill-current" />
          <span>Think-Class</span>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="hidden md:flex gap-8 font-medium text-[#7d6b5a]"
        >
          <Link to="/about" className="hover:text-[#d97757] transition-colors">关于我们</Link>
          <Link to="/services" className="hover:text-[#d97757] transition-colors">服务介绍</Link>
          <Link to="/news" className="hover:text-[#d97757] transition-colors">最新动态</Link>
          <Link to="/contact" className="hover:text-[#d97757] transition-colors">联系我们</Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Link 
            to="/login" 
            className="px-6 py-2.5 rounded-full bg-[#d97757] text-white font-medium hover:bg-[#c26649] transition-all shadow-md hover:shadow-lg flex items-center gap-2"
          >
            开启旅程 <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-16 md:pt-24 pb-24 space-y-32">
        
        {/* HERO SECTION */}
        <section className="grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight text-[#4a3b2c] mb-6 whitespace-pre-wrap">
              {hero.title}
            </h1>
            <p className="text-lg md:text-xl text-[#7d6b5a] mb-10 leading-relaxed max-w-lg">
              {hero.subtitle}
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Link 
                to={hero.buttonLink || "/login"}
                className="px-8 py-4 rounded-full bg-[#8fb9a8] text-white font-medium hover:bg-[#7ca795] transition-all shadow-[0_8px_20px_rgba(143,185,168,0.3)] hover:-translate-y-1 text-lg flex items-center gap-2"
              >
                {hero.buttonText || "开启旅程"} <Users className="w-5 h-5" />
              </Link>
              <Link 
                to="/about"
                className="px-8 py-4 rounded-full bg-white text-[#d97757] border-2 border-[#f0e6d3] font-medium hover:border-[#d97757] transition-all hover:-translate-y-1 text-lg flex items-center gap-2"
              >
                了解更多 <BookOpen className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="relative"
          >
            <div className="aspect-square bg-[#f2e9d8] rounded-full absolute inset-0 -z-10 blur-3xl opacity-60 animate-pulse"></div>
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-2xl hover:scale-[1.02] transition-transform duration-700">
              <path fill="#d97757" d="M47.7,-57.2C60.1,-46.3,67.3,-28.9,71.5,-10.1C75.7,8.7,76.9,28.9,67.2,43.3C57.5,57.7,36.9,66.4,15.7,71.2C-5.5,76,-27.3,76.9,-43.5,67.2C-59.7,57.5,-70.3,37.2,-73.4,16.5C-76.5,-4.2,-72,-25.3,-59.4,-41.2C-46.8,-57.1,-26.1,-67.8,-5.6,-61.2C14.9,-54.6,29.8,-50.7,47.7,-57.2Z" transform="translate(100 100)" />
              <circle cx="80" cy="80" r="15" fill="#fcfaf5" />
              <circle cx="120" cy="70" r="10" fill="#fcfaf5" />
              <path d="M70,120 Q100,150 130,120" stroke="#fcfaf5" strokeWidth="8" strokeLinecap="round" fill="none" />
            </svg>
          </motion.div>
        </section>

        {/* LATEST ARTICLES SECTION */}
        <section className="relative">
          <div className="flex justify-between items-end mb-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl font-extrabold text-[#4a3b2c] mb-3">最新动态</h2>
              <p className="text-[#7d6b5a] text-lg">探索王国里发生的新鲜事</p>
            </motion.div>
            <Link to="/news" className="hidden sm:flex items-center text-[#d97757] font-bold hover:text-[#c26649] transition-colors group">
              查看全部动态 <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {loading ? (
            <div className="grid md:grid-cols-3 gap-8">
              {[1,2,3].map(i => (
                <div key={i} className="animate-pulse bg-white/50 rounded-[2rem] h-[400px] border border-[#f0e6d3]"></div>
              ))}
            </div>
          ) : articles.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-8">
              {articles.map((article, idx) => (
                <motion.div 
                  key={article.id}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.15 }}
                  onClick={() => navigate('/news')}
                  className="group cursor-pointer bg-white rounded-[2.5rem] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(217,119,87,0.1)] transition-all duration-500 hover:-translate-y-2 border border-[#f0e6d3] flex flex-col"
                >
                  <div className="relative h-56 overflow-hidden bg-[#f1f8f5]">
                    {article.cover_image ? (
                      <img 
                        src={article.cover_image} 
                        alt={article.title} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[#8fb9a8]">
                        <Newspaper className="w-16 h-16 opacity-40 group-hover:scale-110 transition-transform duration-700" />
                      </div>
                    )}
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold text-[#d97757] shadow-sm">
                      {article.category || '新闻'}
                    </div>
                  </div>
                  
                  <div className="p-8 flex-1 flex flex-col">
                    <h3 className="text-xl font-bold text-[#4a3b2c] mb-3 line-clamp-2 group-hover:text-[#d97757] transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-[#7d6b5a] text-sm line-clamp-3 mb-6 leading-relaxed flex-1">
                      {article.summary || article.content.substring(0, 100).replace(/[#*`>]/g, '') + '...'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-[#a3988c] font-medium pt-4 border-t border-[#f0e6d3]/60">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1.5" />
                        {new Date(article.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex items-center">
                        <Eye className="w-4 h-4 mr-1.5" />
                        {article.view_count || 0} 次阅读
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/50 rounded-[3rem] border border-[#f0e6d3]">
              <Newspaper className="w-12 h-12 mx-auto text-[#d97757]/40 mb-4" />
              <p className="text-[#7d6b5a] text-lg font-medium">王国里暂无最新动态哦~</p>
            </div>
          )}
          <div className="mt-8 text-center sm:hidden">
            <Link to="/news" className="inline-flex items-center text-[#d97757] font-bold px-6 py-3 bg-white rounded-full shadow-sm">
              查看全部动态 <ChevronRight className="w-5 h-5 ml-1" />
            </Link>
          </div>
        </section>

        {/* ABOUT & QUICK LINKS */}
        <section>
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="bg-[#f1f8f5] rounded-[3rem] p-10 md:p-16 flex flex-col md:flex-row items-center gap-12 border border-[#8fb9a8]/20"
          >
            <div className="flex-1 space-y-6">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#4a3b2c]">{about.title}</h2>
              <p className="text-lg text-[#7d6b5a] leading-relaxed whitespace-pre-wrap">{about.content}</p>
            </div>
            <div className="w-full md:w-1/3 grid grid-cols-2 gap-4">
              {[
                { icon: BookOpen, title: "关于我们", link: "/about", color: "text-[#d97757]", bg: "bg-[#fdf4f1]" },
                { icon: Users, title: "服务介绍", link: "/services", color: "text-[#8fb9a8]", bg: "bg-white" },
                { icon: Newspaper, title: "最新动态", link: "/news", color: "text-[#e8b560]", bg: "bg-white" },
                { icon: Phone, title: "联系我们", link: "/contact", color: "text-[#6b8cce]", bg: "bg-[#f0f4fc]" }
              ].map((item, idx) => (
                <Link key={idx} to={item.link} className="group block">
                  <div className={`p-5 rounded-3xl ${item.bg} border border-transparent group-hover:border-current transition-all group-hover:-translate-y-1 shadow-sm group-hover:shadow-md duration-300 ${item.color} flex flex-col items-center text-center`}>
                    <item.icon className="w-8 h-8 mb-3" />
                    <h3 className="text-sm font-bold text-[#4a3b2c]">{item.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        </section>
        
      </main>
    </div>
  );
}
