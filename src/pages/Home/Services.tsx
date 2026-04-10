import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layout, Shield, Zap, Smartphone, Users, BarChart3, Settings, Star } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HomeServices() {
  const navigate = useNavigate();

  const services = [
    {
      icon: <Users className="w-8 h-8 text-[#d97757]" />,
      title: '多角色管理',
      description: '支持超级管理员、教师、学生和家长等多种角色，各司其职，权限分明，满足不同使用场景需求。',
      color: 'bg-[#fdf4f1] border-[#f0e6d3]'
    },
    {
      icon: <Star className="w-8 h-8 text-[#e8b560]" />,
      title: '科学评价体系',
      description: '提供光荣榜、积分系统和排行榜，通过正向激励激发学生的学习兴趣和良好习惯养成。',
      color: 'bg-[#fcf8f0] border-[#f0e6d3]'
    },
    {
      icon: <Smartphone className="w-8 h-8 text-[#8fb9a8]" />,
      title: '家校无缝沟通',
      description: '内置消息通知、班级公告和家校本功能，让家长随时掌握孩子在校表现，打破信息壁垒。',
      color: 'bg-[#f1f8f5] border-[#f0e6d3]'
    },
    {
      icon: <Layout className="w-8 h-8 text-[#6b8cce]" />,
      title: '数字大屏展示',
      description: '支持班级数字大屏展示，实时更新班级动态、表扬信息和光荣榜，打造现代化智慧教室。',
      color: 'bg-[#f0f4fc] border-[#f0e6d3]'
    },
    {
      icon: <Zap className="w-8 h-8 text-[#d97757]" />,
      title: '趣味互动体验',
      description: '集成幸运抽奖、积分商城兑换、互动墙等趣味功能，让班级管理和学习过程更加生动有趣。',
      color: 'bg-[#fdf4f1] border-[#f0e6d3]'
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-[#e8b560]" />,
      title: '数据统计分析',
      description: '多维度的数据报表，直观展示班级整体情况和学生个体发展轨迹，辅助教师科学决策。',
      color: 'bg-[#fcf8f0] border-[#f0e6d3]'
    },
    {
      icon: <Shield className="w-8 h-8 text-[#8fb9a8]" />,
      title: '安全可靠护航',
      description: '采用企业级数据加密和权限控制技术，确保学校、老师和学生的隐私数据绝对安全。',
      color: 'bg-[#f1f8f5] border-[#f0e6d3]'
    },
    {
      icon: <Settings className="w-8 h-8 text-[#6b8cce]" />,
      title: '高度可定制化',
      description: '灵活的系统设置，支持自定义班级信息、评价标准和奖励规则，适应不同学校的管理特色。',
      color: 'bg-[#f0f4fc] border-[#f0e6d3]'
    }
  ];

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
            <Layout className="w-6 h-6" />
            <span className="text-xl font-bold tracking-wide">产品服务</span>
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
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#4a3b2c] mb-6">全方位的智慧班级解决方案</h1>
          <p className="text-lg md:text-xl text-[#7d6b5a] max-w-3xl mx-auto leading-relaxed">
            我们提供了一套完整的教育管理工具，旨在减轻教师负担，促进家校合作，助力学生全面发展。
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={index} 
              className={`bg-white rounded-3xl p-8 border border-transparent hover:border-[#f0e6d3] shadow-sm hover:shadow-xl hover:shadow-[#d97757]/5 transition-all duration-300 transform hover:-translate-y-2 flex flex-col items-center text-center`}
            >
              <div className={`w-16 h-16 rounded-2xl ${service.color} flex items-center justify-center mb-6 shadow-inner`}>
                {service.icon}
              </div>
              <h3 className="text-xl font-bold text-[#4a3b2c] mb-3">{service.title}</h3>
              <p className="text-[#7d6b5a] text-[15px] leading-relaxed">
                {service.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-24 bg-[#fdf4f1] rounded-[2.5rem] p-12 md:p-16 text-center border border-[#f0e6d3] shadow-lg relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#f2c779] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#8fb9a8] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>
          
          <h2 className="text-3xl md:text-4xl font-extrabold mb-6 text-[#4a3b2c] relative z-10">
            准备好开启您的教育故事了吗？
          </h2>
          <p className="text-lg text-[#7d6b5a] mb-10 max-w-2xl mx-auto relative z-10 leading-relaxed">
            立即注册体验所有功能，或者联系我们的团队获取详细的演示和解决方案。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 relative z-10">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/login')}
              className="px-8 py-4 bg-[#d97757] text-white font-bold rounded-2xl hover:bg-[#c26649] transition-colors shadow-lg shadow-[#d97757]/20 w-full sm:w-auto text-lg"
            >
              立即体验系统
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/contact')}
              className="px-8 py-4 bg-white text-[#d97757] font-bold rounded-2xl hover:bg-[#fcfaf5] border-2 border-[#f0e6d3] hover:border-[#d97757] transition-all shadow-sm w-full sm:w-auto text-lg"
            >
              联系我们
            </motion.button>
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
