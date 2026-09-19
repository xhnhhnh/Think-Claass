import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useEffect, useMemo } from 'react';
import CampusShell from '@/components/Layout/CampusShell';
import { visibleNavItems } from '@/components/Layout/navRegistry';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { defaultClassFeatures, getFirstEnabledRoute } from '@/lib/classFeatures';
import { studentFeatureRequirements, isFeatureRequirementEnabled } from '@/lib/featureRoutes';

/**
 * Student shell.
 *
 * The menu comes from the route table (`visibleNavItems`), which owns each route's path, label
 * and feature gate. This file used to declare all of that a second time in an `allNavItems`
 * array, and the gate keys a third time via `studentFeatureRequirements`.
 */
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

  const navItems = useMemo(() => visibleNavItems('/student', features), [features]);

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

  const currentTitle = navItems.find((item) => item.path === location.pathname)?.label || '我的精灵';

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
