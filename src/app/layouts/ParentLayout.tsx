import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';

import { AppShell } from '@/app/layouts/AppShell';
import { useResolvedClassFeatures } from '@/features/classroom/hooks/useResolvedClassFeatures';
import { getFirstEnabledRoute } from '@/lib/classFeatures';
import { parentFeatureRequirements, isFeatureRequirementEnabled } from '@/lib/featureRoutes';
import { useStore } from '@/store/useStore';

/**
 * Parent console.
 *
 * Same three load-bearing behaviours as the student console, preserved verbatim:
 *
 *   - the feature flags come from a live read (`useResolvedClassFeatures`), not from the
 *     snapshot the login payload embeds. The snapshot made a parent's view of the switches
 *     as stale as their session: a teacher could turn 家庭时光 on and the parent's menu
 *     would not change until they signed in again;
 *   - the redirect never runs while the flags are unknown (`canDecide`), which is the bug
 *     that used to bounce every student - and would have bounced every parent;
 *   - a feature-gated route opened directly while its flag is off redirects to the first
 *     route in the parent order that is available.
 *
 * What changed is only the presentation: the old shell rendered a role badge, the sentence
 * about the product under the title, a hero banner, and a logout button labelled 轻轻离开 -
 * which was charming and also the only way out of the console, in a place a reader does not
 * look for the way out. The account menu owns it now.
 */
export default function ParentLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const classId = Number(user?.classId ?? user?.class_id) || null;
  const { features, canDecide } = useResolvedClassFeatures(classId, { refetchInterval: 5000 });

  /**
   * Menu entries to hide.
   *
   * The route table already gates `/parent/tasks` on `enable_family_tasks`, so this is
   * empty today - it exists because the parent console is the one place where the same
   * question is asked twice, and the answer has to come from one function or the rail and
   * the redirect will eventually disagree.
   */
  const hiddenPaths = useMemo(
    () =>
      Object.entries(parentFeatureRequirements)
        .filter(([, requirement]) => !isFeatureRequirementEnabled(features, requirement))
        .map(([path]) => path),
    [features],
  );

  const fallbackPath = useMemo(
    () => getFirstEnabledRoute('parent', features) ?? '/parent/dashboard',
    [features],
  );

  useEffect(() => {
    // Never redirect on an answer we do not have yet.
    if (!canDecide) return;

    if (location.pathname === '/parent') {
      navigate(fallbackPath, { replace: true });
      return;
    }

    const requirement = parentFeatureRequirements[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(features, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [canDecide, fallbackPath, features, location.pathname, navigate]);

  if (!user) return null;

  return (
    <AppShell
      role="parent"
      brand={{ label: '成长日记', meta: user.name || user.username || '家长', icon: Heart }}
      fallbackTitle="温馨家园"
      homePath={fallbackPath}
      settingsPath="/parent/settings"
      features={features}
      hiddenPaths={hiddenPaths}
      userLabel={user.name || user.username || '家长'}
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    >
      <Outlet />
    </AppShell>
  );
}
