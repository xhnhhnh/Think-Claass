import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useEffect, useMemo } from 'react';
import CampusShell from '@/components/Layout/CampusShell';
import { iconFor, navEntries } from '@/components/Layout/navRegistry';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { useClasses } from '@/hooks/queries/useClasses';
import {
  defaultClassFeatures,
  isFeatureRequirementEnabled,
  type FeatureRequirement,
} from '@/lib/classFeatures';

/**
 * Teacher menu gates.
 *
 * The path, label and menu order come from the route table (see `navRegistry.ts`); this map adds
 * the gate where it does not agree with the route's own `feature`.
 *
 * The two are separate on purpose here rather than by oversight. The visitor-facing gate answers
 * "may this route be loaded" - `/teacher/brawl` is gated on `enable_class_brawl` both ways. The
 * menu gate answers "is this entry useful right now", which is sometimes a different question:
 *
 *   - `/teacher/communication` is an inbox fed by six student-facing features, so it is shown if
 *     ANY of them is on, while the route itself is ungated;
 *   - `/teacher/certificates` is gated on `enable_achievements` here but on nothing in the route
 *     table;
 *   - `/teacher/task-tree` and `/teacher/world-boss` are not menu entries at all (no label), and
 *     appear below only because a future menu entry is expected.
 *
 * Collapsing these into the route table would change which pages teachers can reach, so they stay
 * explicit until someone decides they should match.
 */
const teacherMenuGates: Partial<Record<string, FeatureRequirement>> = {
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

  const allNavItems = useMemo(() => navEntries('/teacher'), []);

  const filteredNavItems = useMemo(
    () =>
      allNavItems
        .filter((item) => isFeatureRequirementEnabled(features, teacherMenuGates[item.path]))
        .map((item) => ({ path: item.path, label: item.label, icon: iconFor(item) })),
    [allNavItems, features],
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

    const requirement = teacherMenuGates[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(features, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [fallbackPath, features, location.pathname, navigate]);

  if (!user) return null;

  // Titles for routes that are not menu entries (adding a student) come from the same table.
  const currentTitle =
    allNavItems.find((item) => item.path === location.pathname)?.label || '添加学生';

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
