import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { 
  Users, ClipboardList, LogOut, Award, Store, Settings, MonitorPlay, 
  BarChart, MessageCircle, Gift, Wrench, CheckCircle, UserCog, BookOpen, 
  FileSpreadsheet, CalendarCheck, Target, Sparkles, ShieldAlert, Package, 
  Gavel, Swords, Map, FileText, Network
} from "lucide-react";
import { useEffect, useMemo } from 'react';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { useClasses } from '@/hooks/queries/useClasses';
import {
  defaultClassFeatures,
  isFeatureRequirementEnabled,
  type FeatureRequirement,
} from '@/lib/classFeatures';

const navItems = [
  { path: '/teacher', icon: Users, label: '班级与学生管理' },
  { path: '/teacher/attendance', icon: CalendarCheck, label: '考勤与请假' },
  { path: '/teacher/assignments', icon: BookOpen, label: '作业管理' },
  { path: '/teacher/exams', icon: FileSpreadsheet, label: '考试与成绩' },
  { path: '/teacher/papers', icon: FileText, label: '试卷系统' },
  { path: '/teacher/knowledge', icon: Network, label: '知识点图谱' },
  { path: '/teacher/team-quests', icon: Target, label: '团队任务' },
  { path: '/teacher/pets', icon: Sparkles, label: '精灵管理' },
  { path: '/teacher/brawl', icon: Swords, label: '跨班大乱斗' },
  { path: '/teacher/territory', icon: Map, label: '领土扩张' },
  { path: '/teacher/records', icon: ClipboardList, label: '积分与兑换记录' },
  { path: '/teacher/certificates', icon: Award, label: '荣誉奖状' },
  { path: '/teacher/shop', icon: Store, label: '商品管理' },
  { path: '/teacher/auction', icon: Gavel, label: '拍卖行管理' },
  { path: '/teacher/blind-box', icon: Package, label: '盲盒管理' },
  { path: '/teacher/features', icon: Settings, label: '功能开关' },
  { path: '/teacher/world-boss', icon: ShieldAlert, label: '世界BOSS管理' },
  { path: '/teacher/lucky-draw-config', icon: Gift, label: '抽奖设置' },
  { path: '/teacher/verification', icon: CheckCircle, label: '奖品核销' },
  { path: '/teacher/communication', icon: MessageCircle, label: '家校与留言' },
  { path: '/teacher/analysis', icon: BarChart, label: '数据分析' },
  { path: '/teacher/tools', icon: Wrench, label: '教学工具' },
  { path: '/teacher/bigscreen', icon: MonitorPlay, label: '大屏展示' },
  { path: '/teacher/settings', icon: UserCog, label: '个人设置' },
];

const teacherFeatureRequirements: Partial<Record<string, FeatureRequirement>> = {
  '/teacher/shop': { key: 'enable_shop' },
  '/teacher/lucky-draw-config': { key: 'enable_lucky_draw' },
  '/teacher/verification': { key: 'enable_lucky_draw' },
  '/teacher/brawl': { key: 'enable_class_brawl' },
  '/teacher/territory': { key: 'enable_slg' },
  '/teacher/task-tree': { key: 'enable_task_tree' },
  '/teacher/world-boss': { key: 'enable_world_boss' },
  '/teacher/auction': { key: 'enable_auction_blind_box' },
  '/teacher/blind-box': { key: 'enable_auction_blind_box' },
  '/teacher/certificates': { key: 'enable_achievements' },
  '/teacher/communication': {
    anyOf: [
      'enable_tree_hole',
      'enable_chat_bubble',
      'enable_peer_review',
      'enable_danmaku',
      'enable_family_tasks',
      'enable_parent_buff',
    ],
  },
};

export default function TeacherLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: classes = [] } = useClasses();
  const defaultClassId = useMemo(() => classes[0]?.id ?? null, [classes]);
  const { data: classFeatureData } = useClassFeatures(defaultClassId);
  const features = classFeatureData?.features ?? defaultClassFeatures;

  const filteredNavItems = useMemo(
    () =>
      navItems.filter((item) =>
        isFeatureRequirementEnabled(features, teacherFeatureRequirements[item.path]),
      ),
    [features],
  );

  const fallbackPath = useMemo(
    () => filteredNavItems[0]?.path ?? '/teacher/features',
    [filteredNavItems],
  );

  useEffect(() => {
    if (location.pathname === '/teacher' && fallbackPath !== '/teacher') {
      navigate(fallbackPath, { replace: true });
      return;
    }

    const requirement = teacherFeatureRequirements[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(features, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [fallbackPath, features, location.pathname, navigate]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans">
      <AnnouncementBanner />
      <div className="flex-1 flex overflow-hidden p-4 gap-6">
        {/* Sidebar */}
        <aside className="w-64 glass rounded-3xl flex flex-col z-10 relative overflow-hidden soft-shadow">
          <div className="h-20 flex items-center px-8 border-b border-white/20 flex-shrink-0">
            <Award className="mr-3 h-8 w-8 text-primary" />
            <span className="font-bold text-xl tracking-wide gemini-gradient-text">教师主控台</span>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {filteredNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-2xl transition-all duration-300 ${
                    isActive 
                      ? 'bg-primary/10 text-primary shadow-sm border border-primary/20 glow-shadow' 
                      : 'text-gray-500 hover:bg-black/5 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t border-white/20 bg-white/30">
            <div className="flex items-center px-4 py-3 text-sm text-gray-700 font-medium mb-2">
              <span className="truncate">欢迎, 老师 {user.username}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-xl text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5 text-red-400" />
              退出登录
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 glass rounded-3xl overflow-hidden relative soft-shadow">
          <header className="h-20 border-b border-white/20 flex items-center px-8 flex-shrink-0 z-10 relative bg-white/40">
            <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">
              {filteredNavItems.find(item => item.path === location.pathname)?.label
                || navItems.find(item => item.path === location.pathname)?.label
                || '添加学生'}
            </h1>
          </header>
          <main className="flex-1 overflow-auto p-8 relative bg-white/50">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
