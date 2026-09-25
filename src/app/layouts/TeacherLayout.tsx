import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

import { AppShell } from '@/app/layouts/AppShell';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { useClasses } from '@/hooks/queries/useClasses';
import {
  defaultClassFeatures,
  isFeatureRequirementEnabled,
  type FeatureRequirement,
} from '@/lib/classFeatures';
import { useStore } from '@/store/useStore';

/**
 * Teacher console.
 *
 * ## The menu gates are a separate list on purpose
 *
 * `teacherMenuGates` below answers "is this entry useful right now", which is sometimes a
 * different question from the route's own `feature` field, which answers "may this route
 * be loaded":
 *
 *   - `/teacher/communication` is an inbox fed by six student-facing features, so its menu
 *     entry shows if ANY of them is on, while the route itself is ungated;
 *   - `/teacher/certificates` is gated on `enable_achievements` here and on nothing in the
 *     route table;
 *   - `/teacher/task-tree` and `/teacher/world-boss` are not menu entries at all (no label)
 *     and appear here only because a future menu entry is expected.
 *
 * Collapsing the two into one would change which pages teachers can reach, so the list
 * stays explicit. This is preserved verbatim from the previous layout - it is behaviour,
 * not presentation, and this refactor is presentation.
 */
const teacherMenuGates: Partial<Record<string, FeatureRequirement>> = {
  '/teacher/shop': { key: 'enable_shop' },
  '/teacher/economy': { key: 'enable_economy' },
  // The 智学 board is only useful where the student half is switched on: a teacher who has turned
  // `enable_ai_study` off for the class has also said they do not want the dispatch screen in their
  // rail. The route itself stays reachable - a menu gate is not a permission.
  '/teacher/ai-study': { key: 'enable_ai_study' },
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

  /**
   * The menu entries this console hides, resolved from the gate map.
   *
   * Computed here rather than left to the route table, because the map answers a question
   * the route table does not ask: `/teacher/communication` is an *ungated* route whose menu
   * entry is useful only when one of six student-facing features is on. Passing the
   * resolved set to the shell keeps the rail, the dock and the command palette filtered
   * identically.
   */
  const hiddenPaths = useMemo(
    () =>
      Object.entries(teacherMenuGates)
        .filter(([, requirement]) => requirement)
        .filter(([, requirement]) => !isFeatureRequirementEnabled(features, requirement))
        .map(([path]) => path),
    [features],
  );

  const fallbackPath = useMemo(() => {
    // The first destination the teacher can actually use, in the fallback order below.
    for (const path of GATE_ORDERED_PATHS) {
      if (isFeatureRequirementEnabled(features, teacherMenuGates[path])) return path;
    }
    return '/teacher';
  }, [features]);

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

  return (
    <AppShell
      role="teacher"
      brand={{ label: '教师主控台', meta: `老师 ${user.username}`, icon: GraduationCap }}
      fallbackTitle="班级与学生管理"
      homePath={fallbackPath}
      settingsPath="/teacher/settings"
      features={features}
      hiddenPaths={hiddenPaths}
      userLabel={user.username}
      railFooter={<ClassContextCount count={classes.length} />}
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
 * The order the teacher console falls back through, matching the route table's own order.
 *
 * Written out rather than derived from the table because it is the *fallback* order, which
 * is a product decision: a teacher whose class has the shop switched off should land on
 * 考勤与请假 rather than on whatever happens to sort first alphabetically.
 */
const GATE_ORDERED_PATHS = [
  '/teacher',
  '/teacher/attendance',
  '/teacher/records',
  '/teacher/communication',
  '/teacher/assignments',
  '/teacher/exams',
  '/teacher/shop',
  '/teacher/economy',
  '/teacher/lucky-draw-config',
  '/teacher/verification',
  '/teacher/brawl',
  '/teacher/territory',
  '/teacher/auction',
  '/teacher/blind-box',
  '/teacher/certificates',
] as const;

/** How many classes the teacher has, in the rail's footer. */
function ClassContextCount({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-role-soft px-2.5 py-2">
      <span className="text-xs font-medium text-role-ink">我的班级</span>
      <span className="text-sm font-bold tabular-nums text-role-ink">{count}</span>
    </div>
  );
}
