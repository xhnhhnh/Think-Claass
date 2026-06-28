import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { 
  Users, ClipboardList, Award, Store, Settings, MonitorPlay, 
  BarChart, MessageCircle, Gift, Wrench, CheckCircle, UserCog, BookOpen, 
  FileSpreadsheet, CalendarCheck, Target, Sparkles, ShieldAlert, Package, 
  Gavel, Swords, Map, FileText, Network, Landmark
} from "lucide-react";
import { useEffect, useMemo } from 'react';
import CampusShell from '@/components/Layout/CampusShell';
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
  { path: '/teacher/economy', icon: Landmark, label: '股票管理' },
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
  '/teacher/economy': { key: 'enable_economy' },
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
  const { data: classFeatureData } = useClassFeatures(defaultClassId, { refetchInterval: 5000 });
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

  const currentTitle =
    filteredNavItems.find(item => item.path === location.pathname)?.label
    || navItems.find(item => item.path === location.pathname)?.label
    || '添加学生';

  return (
    <CampusShell
      role="teacher"
      title={currentTitle}
      subtitle="把班级、学习、积分和家校沟通收进一个清爽的课堂工作台。"
      navItems={filteredNavItems}
      brandLabel="教师主控台"
      userLabel={`老师 ${user.username}`}
      userMeta="班级成长运营"
      homePath={fallbackPath}
      showAnnouncement
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    >
      <Outlet />
    </CampusShell>
  );
}
