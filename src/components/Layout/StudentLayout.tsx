import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Star, ShoppingBag, LogOut, Crown, Swords, Gift, Ticket, MessageSquare, BookOpen, Users, Award, Medal, MessageSquareHeart, Gavel, GitBranch, Crosshair, MapPin, Sparkles, Building2, Skull } from 'lucide-react';
import { useEffect } from 'react';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { motion } from 'framer-motion';

export default function StudentLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user || user.role !== 'student') {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user) return null;

  const navItems = [
    { path: '/student/pet', icon: Star, label: '我的精灵' },
    { path: '/student/shop', icon: ShoppingBag, label: '积分商城' },
    { path: '/student/auction', icon: Gavel, label: '拍卖行' },
    { path: '/student/challenge', icon: Swords, label: '挑战模式' },
    { path: '/student/lucky-draw', icon: Gift, label: '翻牌抽奖' },
    { path: '/student/my-redemptions', icon: Ticket, label: '我的兑换' },
    { path: '/student/certificates', icon: Award, label: '荣誉奖状' },
    { path: '/student/achievements', icon: Medal, label: '成就墙' },
    { path: '/student/interactive-wall', icon: MessageSquare, label: '互动墙' },
    { path: '/student/peer-review', icon: MessageSquareHeart, label: '同伴互评' },
    { path: '/student/dungeon', icon: Skull, label: '无尽塔' },
    { path: '/student/brawl', icon: Crosshair, label: '大乱斗' },
    { path: '/student/gacha', icon: Sparkles, label: '召唤法阵' },
    { path: '/student/task-tree', icon: GitBranch, label: '技能树' },
    { path: '/student/territory', icon: MapPin, label: '版图' },
    { path: '/student/bank', icon: Building2, label: '银行股市' },
    { path: '/student/guild-pk', icon: Swords, label: '公会PK' },
    { path: '/student/assignments', icon: BookOpen, label: '学业中心' },
    { path: '/student/team-quests', icon: Users, label: '团队任务' },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans theme-student relative overflow-hidden">
      {/* Decorative ambient background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px] pointer-events-none" />

      <AnnouncementBanner />
      
      {/* Top Navbar */}
      <header className="relative z-10 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto glass rounded-3xl p-4 flex flex-col md:flex-row justify-between items-center gap-6 soft-shadow">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/student/pet')}
            className="flex items-center px-6 py-2 cursor-pointer"
          >
            <Crown className="mr-3 h-8 w-8 text-primary" />
            <span className="text-2xl font-black tracking-wider gemini-gradient-text">
              Think-Class
            </span>
          </motion.div>
          
          <div className="flex flex-wrap justify-center gap-2 max-h-32 overflow-y-auto custom-scrollbar p-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center px-4 py-2 rounded-2xl text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? 'bg-primary text-white shadow-lg glow-shadow'
                      : 'bg-white/50 text-gray-600 hover:bg-white/80 hover:text-primary border border-white/40 shadow-sm'
                  }`}
                >
                  <Icon className={`mr-2 h-4 w-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  {item.label}
                </motion.button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center px-5 py-2.5 bg-white/60 backdrop-blur-md text-gray-800 rounded-2xl font-bold text-sm border border-white/50 shadow-sm">
              <span className="truncate">{user.name}</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="p-2.5 bg-white/60 backdrop-blur-md text-gray-500 hover:text-red-500 rounded-2xl border border-white/50 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm"
            >
              <LogOut className="h-5 w-5" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto p-4 sm:p-6 lg:p-8 relative z-10">
        <div className="h-full glass rounded-3xl p-6 soft-shadow overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}