import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  Users, ClipboardList, LogOut, Award, Store, Settings,
  MonitorPlay, BarChart, MessageCircle, Gift, Wrench,
  CheckCircle, UserCog, BookOpen, FileSpreadsheet,
  CalendarCheck, Target, Sparkles, ShieldAlert, Package,
  Gavel, GitBranch, Swords, Map
} from "lucide-react";
import { useEffect } from 'react';
import AnnouncementBanner from '@/components/AnnouncementBanner';

const MENU_ITEMS = [
  { path: '/teacher', icon: Users, label: '班级与学生管理', title: '学生管理与积分操作', color: 'indigo' },
  { path: '/teacher/attendance', icon: CalendarCheck, label: '考勤与请假', title: '考勤与请假', color: 'indigo' },
  { path: '/teacher/assignments', icon: BookOpen, label: '作业管理', title: '作业管理', color: 'indigo' },
  { path: '/teacher/exams', icon: FileSpreadsheet, label: '考试与成绩', title: '考试与成绩', color: 'indigo' },
  { path: '/teacher/team-quests', icon: Target, label: '团队任务', title: '团队任务', color: 'indigo' },
  { path: '/teacher/task-tree', icon: GitBranch, label: '多维任务树管理', title: '多维任务树管理', color: 'indigo' },
  { path: '/teacher/pets', icon: Sparkles, label: '精灵管理', title: '精灵管理', color: 'indigo' },
  { path: '/teacher/brawl', icon: Swords, label: '跨班大乱斗', title: '跨班大乱斗', color: 'indigo' },
  { path: '/teacher/territory', icon: Map, label: '领土扩张', title: '领土扩张', color: 'indigo' },
  { path: '/teacher/records', icon: ClipboardList, label: '积分与兑换记录', title: '记录审核', color: 'indigo' },
  { path: '/teacher/certificates', icon: Award, label: '荣誉奖状', title: '荣誉奖状', color: 'indigo' },
  { path: '/teacher/shop', icon: Store, label: '商品管理', title: '商品管理', color: 'indigo' },
  { path: '/teacher/auction', icon: Gavel, label: '拍卖行管理', title: '拍卖行管理', color: 'amber' },
  { path: '/teacher/blind-box', icon: Package, label: '盲盒管理', title: '盲盒管理', color: 'purple' },
  { path: '/teacher/features', icon: Settings, label: '功能开关', title: '功能开关', color: 'indigo' },
  { path: '/teacher/world-boss', icon: ShieldAlert, label: '世界BOSS管理', title: '世界BOSS管理', color: 'red' },
  { path: '/teacher/lucky-draw-config', icon: Gift, label: '抽奖设置', title: '抽奖设置', color: 'indigo' },
  { path: '/teacher/verification', icon: CheckCircle, label: '奖品核销', title: '奖品核销', color: 'indigo' },
  { path: '/teacher/communication', icon: MessageCircle, label: '家校与留言', title: '家校与留言', color: 'indigo' },
  { path: '/teacher/analysis', icon: BarChart, label: '数据分析', title: '数据分析', color: 'indigo' },
  { path: '/teacher/tools', icon: Wrench, label: '教学工具', title: '教学工具', color: 'indigo' },
  { path: '/teacher/bigscreen', icon: MonitorPlay, label: '大屏展示', title: '大屏展示', color: 'indigo' },
  { path: '/teacher/settings', icon: UserCog, label: '个人设置', title: '个人设置', color: 'indigo' },
];

const colorStyles: Record<string, { activeBg: string; activeText: string; activeIcon: string; hoverBg: string }> = {
  indigo: {
    activeBg: 'bg-indigo-50/90 shadow-sm border border-indigo-100/60',
    activeText: 'text-indigo-700',
    activeIcon: 'text-indigo-600',
    hoverBg: 'hover:bg-indigo-50/50',
  },
  amber: {
    activeBg: 'bg-amber-50/90 shadow-sm border border-amber-100/60',
    activeText: 'text-amber-700',
    activeIcon: 'text-amber-600',
    hoverBg: 'hover:bg-amber-50/50',
  },
  purple: {
    activeBg: 'bg-purple-50/90 shadow-sm border border-purple-100/60',
    activeText: 'text-purple-700',
    activeIcon: 'text-purple-600',
    hoverBg: 'hover:bg-purple-50/50',
  },
  red: {
    activeBg: 'bg-red-50/90 shadow-sm border border-red-100/60',
    activeText: 'text-red-700',
    activeIcon: 'text-red-600',
    hoverBg: 'hover:bg-red-50/50',
  },
};

export default function TeacherLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user || user.role !== 'teacher') {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user) return null;

  const activeItem = MENU_ITEMS.find(item => item.path === location.pathname);
  const pageTitle = activeItem ? activeItem.title : (location.pathname === '/teacher/add-student' ? '添加学生' : '教师主控台');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex flex-col font-sans">
      <AnnouncementBanner />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white/60 backdrop-blur-2xl border-r border-white/60 shadow-[4px_0_24px_rgba(0,0,0,0.04)] flex flex-col z-20 relative">
          <div className="h-16 flex items-center px-6 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-bold text-xl tracking-wide shadow-sm flex-shrink-0">
            <Award className="mr-2 h-6 w-6" />
            教师主控台
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
            {MENU_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              const styles = colorStyles[item.color] || colorStyles.indigo;
              
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 group ${
                    isActive 
                      ? styles.activeBg + ' ' + styles.activeText 
                      : 'text-gray-600 hover:text-gray-900 border border-transparent ' + styles.hoverBg
                  }`}
                >
                  <item.icon 
                    className={`mr-3 h-5 w-5 transition-colors duration-200 ${
                      isActive ? styles.activeIcon : 'text-gray-400 group-hover:text-gray-600'
                    }`} 
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t border-gray-100/80 bg-white/30 backdrop-blur-md">
            <div className="flex items-center px-4 py-3 text-sm text-gray-700 font-medium mb-2 bg-white/40 rounded-xl shadow-sm border border-white/50">
              <span className="truncate">欢迎, 老师 {user.username}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl text-red-600 hover:bg-red-50 hover:shadow-sm border border-transparent hover:border-red-100/50 transition-all duration-200"
            >
              <LogOut className="mr-3 h-5 w-5 text-red-400" />
              退出登录
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden relative z-10">
          <header className="bg-white/60 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] h-16 border-b border-white/60 flex items-center px-8 flex-shrink-0 z-20 relative">
            <h1 className="text-xl font-semibold text-gray-800 tracking-tight">
              {pageTitle}
            </h1>
          </header>
          <main className="flex-1 overflow-auto p-8 relative z-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
