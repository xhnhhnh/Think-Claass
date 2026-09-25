import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { AppShell } from '@/app/layouts/AppShell';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useQuery } from '@tanstack/react-query';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { useResolvedClassFeatures } from '@/features/classroom/hooks/useResolvedClassFeatures';
import { getFirstEnabledRoute } from '@/lib/classFeatures';
import { studentFeatureRequirements, isFeatureRequirementEnabled } from '@/lib/featureRoutes';

/**
 * Student console.
 *
 * ## What is load-bearing here, and why it is unchanged
 *
 * The feature-flag handling below is the one part of the old layout that was outright
 * wrong once and is now right, so it is preserved rather than rewritten:
 *
 *   - `useResolvedClassFeatures` distinguishes "the flags have not loaded" from "the flags
 *     are off". The redirect effect used to run while they were in flight, when every flag
 *     read as `false`, and sent the student away from the page they had opened to
 *     `/student/pet` - on every hard refresh, for every student, whatever the teacher had
 *     configured. `canDecide` is what gates it.
 *   - `getFirstEnabledRoute` is the fallback: the first route in the student default order
 *     whose flag is on, so a class with 积分商城 switched off does not land a student on a
 *     disabled page.
 *   - A feature-gated route the student opens directly while its flag is off redirects,
 *     rather than rendering the guard's disabled state on a page they cannot use.
 *
 * What changed is only the presentation: the old version rendered `CampusShell` with a
 * title it derived by finding the current path in its own nav list (`|| '我的精灵'` as the
 * fallback), a subtitle sentence about the product, and a hero banner. The new shell takes
 * the title from the route table, keeps the rail, and puts the mobile navigation in a dock.
 */
export default function StudentLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const classId = Number(user?.classId ?? user?.class_id) || null;
  const { features, canDecide } = useResolvedClassFeatures(classId, { refetchInterval: 5000 });

  const fallbackPath = useMemo(
    () => getFirstEnabledRoute('student', features) ?? '/student/pet',
    [features],
  );

  useEffect(() => {
    // Deciding while the flags are unknown is what produced the bounce; wait for the
    // real answer.
    if (!canDecide) return;

    const requirement = studentFeatureRequirements[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(features, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [canDecide, fallbackPath, features, location.pathname, navigate]);

  if (!user) return null;

  return (
    <AppShell
      role="student"
      brand={{ label: '我的成长', meta: user.name || user.username, icon: Sparkles }}
      fallbackTitle="学生空间"
      homePath="/student"
      settingsPath="/student/settings"
      features={features}
      userLabel={user.name || user.username}
      railFooter={<StudentPointBalance />}
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    >
      <Outlet />
    </AppShell>
  );
}

/**
 * The student's point balance, in the rail's footer.
 *
 * This is the one figure a student checks constantly. The old shell had it in a profile
 * card in the middle of the rail behind a decorative sprout icon; here it is the only
 * thing in the footer, and the reason the footer exists at all.
 */
function StudentPointBalance() {
  const user = useStore((state) => state.user);
  const { data } = useQuery({
    queryKey: ['motivation-summary', user?.studentId],
    queryFn: () => studentsApi.getSummary(user!.studentId!),
    enabled: Boolean(user?.studentId),
  });
  if (!user) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-role-soft px-2.5 py-2">
      <span className="text-xs font-medium text-role-ink">可用积分</span>
      <span className="text-sm font-bold tabular-nums text-role-ink">
        {data?.summary.availableCredits ?? user.available_points ?? 0}
      </span>
    </div>
  );
}
