import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Users, ClipboardList, LogOut, Award, Store, Settings, MonitorPlay, BarChart, MessageCircle, Gift, Wrench, CheckCircle, UserCog, BookOpen, FileSpreadsheet, CalendarCheck, Target, Sparkles, ShieldAlert, Package, Gavel, GitBranch, Swords, Map } from "lucide-react";
import { useEffect } from 'react';
import AnnouncementBanner from '@/components/AnnouncementBanner';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex flex-col font-sans">
      <AnnouncementBanner />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white/70 backdrop-blur-xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col z-10 relative">
          <div className="h-16 flex items-center px-6 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-bold text-xl tracking-wide shadow-sm flex-shrink-0">
            <Award className="mr-2 h-6 w-6" />
            教师主控台
          </div>
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <button
            onClick={() => navigate('/teacher')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Users className={`mr-3 h-5 w-5 ${location.pathname === '/teacher' ? 'text-indigo-600' : 'text-gray-400'}`} />
            班级与学生管理
          </button>
          <button
            onClick={() => navigate('/teacher/attendance')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/attendance' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <CalendarCheck className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/attendance' ? 'text-indigo-600' : 'text-gray-400'}`} />
            考勤与请假
          </button>
          <button
            onClick={() => navigate('/teacher/assignments')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/assignments' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BookOpen className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/assignments' ? 'text-indigo-600' : 'text-gray-400'}`} />
            作业管理
          </button>
          <button
            onClick={() => navigate('/teacher/exams')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/exams' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <FileSpreadsheet className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/exams' ? 'text-indigo-600' : 'text-gray-400'}`} />
            考试与成绩
          </button>
          <button
            onClick={() => navigate('/teacher/team-quests')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/team-quests' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Target className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/team-quests' ? 'text-indigo-600' : 'text-gray-400'}`} />
            团队任务
          </button>
          <button
            onClick={() => navigate('/teacher/pets')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/pets' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Sparkles className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/pets' ? 'text-indigo-600' : 'text-gray-400'}`} />
            精灵管理
          </button>
          <button
            onClick={() => navigate('/teacher/brawl')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/brawl' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Swords className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/brawl' ? 'text-indigo-600' : 'text-gray-400'}`} />
            跨班大乱斗
          </button>
          <button
            onClick={() => navigate('/teacher/brawl')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/brawl' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Swords className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/brawl' ? 'text-indigo-600' : 'text-gray-400'}`} />
            跨班大乱斗
          </button>
          <button
            onClick={() => navigate('/teacher/territory')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/territory' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Map className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/territory' ? 'text-indigo-600' : 'text-gray-400'}`} />
            领土扩张
          </button>
          <button
            onClick={() => navigate('/teacher/records')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/records' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <ClipboardList className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/records' ? 'text-indigo-600' : 'text-gray-400'}`} />
            积分与兑换记录
          </button>
          <button
            onClick={() => navigate('/teacher/certificates')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/certificates' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Award className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/certificates' ? 'text-indigo-600' : 'text-gray-400'}`} />
            荣誉奖状
          </button>
          <button
            onClick={() => navigate('/teacher/shop')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/shop' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Store className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/shop' ? 'text-indigo-600' : 'text-gray-400'}`} />
            商品管理
          </button>
          <button
            onClick={() => navigate('/teacher/auction')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/auction' ? 'bg-amber-50/80 text-amber-700 shadow-sm border border-amber-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Gavel className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/auction' ? 'text-amber-600' : 'text-gray-400'}`} />
            拍卖行管理
          </button>
          <button
            onClick={() => navigate('/teacher/blind-box')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/blind-box' ? 'bg-purple-50/80 text-purple-700 shadow-sm border border-purple-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Package className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/blind-box' ? 'text-purple-600' : 'text-gray-400'}`} />
            盲盒管理
          </button>
          <button
            onClick={() => navigate('/teacher/features')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/features' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/features' ? 'text-indigo-600' : 'text-gray-400'}`} />
            功能开关
          </button>
          <button
            onClick={() => navigate('/teacher/world-boss')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/world-boss' ? 'bg-red-50/80 text-red-700 shadow-sm border border-red-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <ShieldAlert className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/world-boss' ? 'text-red-600' : 'text-gray-400'}`} />
            世界BOSS管理
          </button>
          <button
            onClick={() => navigate('/teacher/lucky-draw-config')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/lucky-draw-config' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Gift className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/lucky-draw-config' ? 'text-indigo-600' : 'text-gray-400'}`} />
            抽奖设置
          </button>
          <button
            onClick={() => navigate('/teacher/verification')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/verification' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <CheckCircle className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/verification' ? 'text-indigo-600' : 'text-gray-400'}`} />
            奖品核销
          </button>
          <button
            onClick={() => navigate('/teacher/communication')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/communication' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <MessageCircle className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/communication' ? 'text-indigo-600' : 'text-gray-400'}`} />
            家校与留言
          </button>
          <button
            onClick={() => navigate('/teacher/analysis')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/analysis' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BarChart className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/analysis' ? 'text-indigo-600' : 'text-gray-400'}`} />
            数据分析
          </button>
          <button
            onClick={() => navigate('/teacher/tools')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/tools' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Wrench className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/tools' ? 'text-indigo-600' : 'text-gray-400'}`} />
            教学工具
          </button>
          <button
            onClick={() => navigate('/teacher/bigscreen')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/bigscreen' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <MonitorPlay className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/bigscreen' ? 'text-indigo-600' : 'text-gray-400'}`} />
            大屏展示
          </button>
          <button
            onClick={() => navigate('/teacher/settings')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/teacher/settings' ? 'bg-indigo-50/80 text-indigo-700 shadow-sm border border-indigo-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <UserCog className={`mr-3 h-5 w-5 ${location.pathname === '/teacher/settings' ? 'text-indigo-600' : 'text-gray-400'}`} />
            个人设置
          </button>
        </nav>
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center px-4 py-3 text-sm text-gray-700 font-medium mb-2">
            <span className="truncate">欢迎, 老师 {user.username}</span>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-red-400" />
            退出登录
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">
        <header className="bg-white/60 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-16 border-b border-white/40 flex items-center px-8 border-b border-gray-100 flex-shrink-0 z-10 relative">
          <h1 className="text-xl font-semibold text-gray-800">
            {location.pathname === '/teacher' && '学生管理与积分操作'}
            {location.pathname === '/teacher/attendance' && '考勤与请假'}
            {location.pathname === '/teacher/assignments' && '作业管理'}
            {location.pathname === '/teacher/exams' && '考试与成绩'}
            {location.pathname === '/teacher/team-quests' && '团队任务'}
            {location.pathname === '/teacher/pets' && '精灵管理'}
            {location.pathname === '/teacher/records' && '记录审核'}
            {location.pathname === '/teacher/certificates' && '荣誉奖状'}
            {location.pathname === '/teacher/shop' && '商品管理'}
            {location.pathname === '/teacher/auction' && '拍卖行管理'}
            {location.pathname === '/teacher/blind-box' && '盲盒管理'}
            {location.pathname === '/teacher/features' && '功能开关'}
            {location.pathname === '/teacher/world-boss' && '世界BOSS管理'}
            {location.pathname === '/teacher/add-student' && '添加学生'}
            {location.pathname === '/teacher/lucky-draw-config' && '抽奖设置'}
            {location.pathname === '/teacher/verification' && '奖品核销'}
            {location.pathname === '/teacher/communication' && '家校与留言'}
            {location.pathname === '/teacher/analysis' && '数据分析'}
            {location.pathname === '/teacher/tools' && '教学工具'}
            {location.pathname === '/teacher/bigscreen' && '大屏展示'}
            {location.pathname === '/teacher/settings' && '个人设置'}
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-8 relative">
          <Outlet />
        </main>
      </div>
      </div>
    </div>
  );
}
