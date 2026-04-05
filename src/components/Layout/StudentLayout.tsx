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
    { path: '/student/pet', icon: Star, label: '我的精灵', color: 'bg-yellow-400 text-yellow-900 border-yellow-500' },
    { path: '/student/shop', icon: ShoppingBag, label: '积分商城', color: 'bg-emerald-400 text-emerald-900 border-emerald-500' },
      { path: '/student/auction', icon: Gavel, label: '拍卖行', color: 'bg-amber-400 text-amber-900 border-amber-500' },
      { path: '/student/challenge', icon: Swords, label: '挑战模式', color: 'bg-red-400 text-red-900 border-red-500' },
    { path: '/student/lucky-draw', icon: Gift, label: '翻牌抽奖', color: 'bg-purple-400 text-purple-900 border-purple-500' },
    { path: '/student/my-redemptions', icon: Ticket, label: '我的兑换', color: 'bg-green-400 text-green-900 border-green-500' },
    { path: '/student/certificates', icon: Award, label: '荣誉奖状', color: 'bg-indigo-400 text-indigo-900 border-indigo-500' },
    { path: '/student/achievements', icon: Medal, label: '成就墙', color: 'bg-amber-400 text-amber-900 border-amber-500' },
    { path: '/student/interactive-wall', icon: MessageSquare, label: '互动墙', color: 'bg-blue-400 text-blue-900 border-blue-500' },
      { path: '/student/peer-review', icon: MessageSquareHeart, label: '同伴互评', color: 'bg-pink-400 text-pink-900 border-pink-500' },
      { path: '/student/dungeon', icon: Skull, label: '无尽塔', color: 'bg-rose-600 text-rose-100 border-rose-500' },
    { path: '/student/brawl', icon: Crosshair, label: '大乱斗', color: 'bg-rose-400 text-rose-900 border-rose-500' },
    { path: '/student/gacha', icon: Sparkles, label: '召唤法阵', color: 'bg-purple-400 text-purple-900 border-purple-500' },
    { path: '/student/task-tree', icon: GitBranch, label: '技能树', color: 'bg-emerald-400 text-emerald-900 border-emerald-500' },
    { path: '/student/territory', icon: MapPin, label: '版图', color: 'bg-teal-400 text-teal-900 border-teal-500' },
    { path: '/student/bank', icon: Building2, label: '银行股市', color: 'bg-amber-400 text-amber-900 border-amber-500' },
    { path: '/student/guild-pk', icon: Swords, label: '公会PK', color: 'bg-indigo-400 text-indigo-900 border-indigo-500' },
      { path: '/student/assignments', icon: BookOpen, label: '学业中心', color: 'bg-teal-400 text-teal-900 border-teal-500' },
    { path: '/student/team-quests', icon: Users, label: '团队任务', color: 'bg-orange-400 text-orange-900 border-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-[#F0FDF4] flex flex-col font-sans">
      <AnnouncementBanner />
      {/* Top Navbar */}
      <header className="bg-white border-b-8 border-green-200 relative z-10 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center text-3xl font-black text-white bg-orange-500 px-6 py-3 rounded-3xl border-b-8 border-orange-600 shadow-xl cursor-pointer tracking-wider"
          >
            <Crown className="mr-3 h-8 w-8 text-yellow-300 fill-current" />
            Think-Class
          </motion.div>
          
          <div className="flex flex-wrap justify-center gap-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  whileHover={{ y: -4 }}
                  whileTap={{ y: 0 }}
                  className={`flex items-center px-4 py-2 rounded-2xl font-bold transition-all border-b-4 ${
                    isActive
                      ? `${item.color} shadow-lg scale-105 ring-4 ring-white`
                      : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200 hover:text-gray-700'
                  }`}
                >
                  <Icon className={`mr-2 h-5 w-5 ${isActive ? '' : 'text-gray-400'}`} />
                  {item.label}
                </motion.button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center px-5 py-2 bg-blue-100 text-blue-800 rounded-2xl font-black text-lg border-b-4 border-blue-300 shadow-sm">
              <span className="truncate">{user.name}</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 10 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="p-3 bg-red-100 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl border-b-4 border-red-300 hover:border-red-700 transition-colors shadow-sm"
            >
              <LogOut className="h-6 w-6" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto p-4 sm:p-6 lg:p-8 relative">
        <Outlet />
      </main>
    </div>
  );
}
