import { useNavigate } from "react-router-dom";
import { ArrowLeft, Layout, Shield, Zap, Smartphone, Users, BarChart3, Settings, Star } from "lucide-react";
import { motion } from "framer-motion";

export default function HomeServices() {
  const navigate = useNavigate();

  const services = [
    { icon: Users, title: "多角色管理", description: "支持超级管理员、教师、学生和家长等多种角色，各司其职，权限分明，满足不同使用场景需求。", color: "text-white", bgBlock: "bg-indigo-500", bgLight: "bg-indigo-50", ring: "ring-indigo-500/10" },
    { icon: Star, title: "科学评价体系", description: "提供光荣榜、积分系统和排行榜，通过正向激励激发学生的学习兴趣和良好习惯养成。", color: "text-white", bgBlock: "bg-amber-500", bgLight: "bg-amber-50", ring: "ring-amber-500/10" },
    { icon: Smartphone, title: "家校无缝沟通", description: "内置消息通知、班级公告和家校本功能，让家长随时掌握孩子在校表现，打破信息壁垒。", color: "text-white", bgBlock: "bg-emerald-500", bgLight: "bg-emerald-50", ring: "ring-emerald-500/10" },
    { icon: Layout, title: "数字大屏展示", description: "支持班级数字大屏展示，实时更新班级动态、表扬信息和光荣榜，打造现代化智慧教室。", color: "text-white", bgBlock: "bg-violet-500", bgLight: "bg-violet-50", ring: "ring-violet-500/10" },
    { icon: Zap, title: "趣味互动体验", description: "集成幸运抽奖、积分商城兑换、互动墙等趣味功能，让班级管理和学习过程更加生动有趣。", color: "text-white", bgBlock: "bg-rose-500", bgLight: "bg-rose-50", ring: "ring-rose-500/10" },
    { icon: BarChart3, title: "数据统计分析", description: "多维度的数据报表，直观展示班级整体情况和学生个体发展轨迹，辅助教师科学决策。", color: "text-white", bgBlock: "bg-cyan-500", bgLight: "bg-cyan-50", ring: "ring-cyan-500/10" },
    { icon: Shield, title: "安全可靠护航", description: "采用企业级数据加密和权限控制技术，确保学校、老师和学生的隐私数据绝对安全。", color: "text-white", bgBlock: "bg-emerald-500", bgLight: "bg-emerald-50", ring: "ring-emerald-500/10" },
    { icon: Settings, title: "高度可定制化", description: "灵活的系统设置，支持自定义班级信息、评价标准和奖励规则，适应不同学校的管理特色。", color: "text-white", bgBlock: "bg-slate-500", bgLight: "bg-slate-50", ring: "ring-slate-500/10" },
  ];

  return (
    <div className="public-campus-page flex min-h-screen flex-col bg-[var(--campus-canvas)] text-slate-800 selection:bg-emerald-100 selection:text-emerald-700 font-sans">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Layout className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900">产品服务</span>
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

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 md:py-20">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">全方位的智慧班级解决方案</h1>
          <p className="text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
            我们提供了一套完整的教育管理工具，旨在减轻教师负担，促进家校合作，助力学生全面发展。
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((service, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              key={index}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 flex flex-col items-center text-center"
            >
              <div className={`h-12 w-12 rounded-xl ${service.bgBlock} flex items-center justify-center mb-4`}>
                <service.icon className={`w-6 h-6 ${service.color}`} />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-2">{service.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{service.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-20 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-12 md:p-14 text-center border border-indigo-100/50 relative overflow-hidden"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 relative z-10">准备好开启您的教育故事了吗？</h2>
          <p className="text-slate-500 mb-8 max-w-xl mx-auto relative z-10">
            立即注册体验所有功能，或者联系我们的团队获取详细的演示和解决方案。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => navigate("/login")}
              className="px-8 py-3 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-600 transition-colors shadow-sm shadow-indigo-500/20 w-full sm:w-auto text-sm">
              立即体验系统
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => navigate("/contact")}
              className="px-8 py-3 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 border border-slate-200 transition-all shadow-sm w-full sm:w-auto text-sm">
              联系我们
            </motion.button>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-slate-100 bg-white py-6 text-center">
        <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} Think-Class. 保留所有权利。</p>
      </footer>
    </div>
  );
}
