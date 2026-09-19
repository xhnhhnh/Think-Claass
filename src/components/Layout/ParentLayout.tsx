import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useEffect, useMemo } from 'react';
import CampusShell from '@/components/Layout/CampusShell';
import { visibleNavItems } from '@/components/Layout/navRegistry';
import { defaultClassFeatures, getFirstEnabledRoute } from '@/lib/classFeatures';
import { parentFeatureRequirements, isFeatureRequirementEnabled } from '@/lib/featureRoutes';

/**
 * Parent shell.
 *
 * The menu comes from the route table, which owns each route's path, label and feature gate -
 * see `navRegistry.ts` for why. This file used to restate all six entries.
 */
export default function ParentLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const features = user?.classFeatures ?? defaultClassFeatures;

  const filteredNavItems = useMemo(() => visibleNavItems('/parent', features), [features]);

  const fallbackPath = useMemo(
    () => getFirstEnabledRoute('parent', features) ?? '/parent/dashboard',
    [features],
  );

  useEffect(() => {
    if (location.pathname === '/parent') {
      navigate(fallbackPath, { replace: true });
      return;
    }

    const requirement = parentFeatureRequirements[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(features, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [fallbackPath, features, location.pathname, navigate]);

  if (!user) return null;

  const currentTitle = filteredNavItems.find((item) => item.path === location.pathname)?.label || '温馨家园';

  return (
    <CampusShell
      role="parent"
      title={currentTitle}
      subtitle="用温暖的成长记录、老师反馈和家校消息陪你看见孩子的每一步。"
      navItems={filteredNavItems}
      brandLabel="成长日记"
      userLabel={user.name || user.username || '家长'}
      userMeta="家校陪伴"
      homePath={fallbackPath}
      logoutLabel="轻轻离开"
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    >
      <Outlet />
    </CampusShell>
  );
}
