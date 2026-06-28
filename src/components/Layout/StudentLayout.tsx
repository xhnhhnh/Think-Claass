import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Star, ShoppingBag, Swords, Gift, Ticket, MessageSquare, BookOpen, Users, Award, Medal, MessageSquareHeart, Gavel, GitBranch, Crosshair, MapPin, Sparkles, Building2, Skull, FileText, ListChecks } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import CampusShell from '@/components/Layout/CampusShell';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import {
  defaultClassFeatures,
  getFirstEnabledRoute,
  isFeatureRequirementEnabled,
  studentFeatureRequirements,
} from '@/lib/classFeatures';

export default function StudentLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const classId = Number(user?.classId ?? user?.class_id) || null;
  const { data: classFeatureData } = useClassFeatures(classId, { refetchInterval: 5000 });
  const features = classId
    ? classFeatureData?.features ?? defaultClassFeatures
    : user?.classFeatures ?? defaultClassFeatures;

  const allNavItems = [
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
    { path: '/student/papers', icon: FileText, label: '试卷练习' },
    { path: '/student/wrong-questions', icon: ListChecks, label: '错题本' },
    { path: '/student/plan', icon: ListChecks, label: '学习计划' },
  ];

  const navItems = useMemo(
    () =>
      allNavItems.filter((item) =>
        isFeatureRequirementEnabled(features, studentFeatureRequirements[item.path]),
      ),
    [features],
  );

  const fallbackPath = useMemo(
    () => getFirstEnabledRoute('student', features) ?? '/student/pet',
    [features],
  );

  useEffect(() => {
    if (location.pathname === '/student') {
      navigate(fallbackPath, { replace: true });
      return;
    }

    const requirement = studentFeatureRequirements[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(features, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [fallbackPath, features, location.pathname, navigate]);

  if (!user) return null;

  const currentTitle = navItems.find(item => item.path === location.pathname)?.label || '我的精灵';

  return (
    <CampusShell
      role="student"
      title={currentTitle}
      subtitle="用任务、徽章、精灵和学习计划把每天的进步变成看得见的校园旅程。"
      navItems={navItems}
      brandLabel="Think-Class"
      userLabel={user.name || user.username}
      userMeta="学生成长旅程"
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
