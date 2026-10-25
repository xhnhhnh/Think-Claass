import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

import { AppShell } from '@/app/layouts/AppShell';
import { Button } from '@/components/ui/button';
import { useResolvedClassFeatures } from '@/features/classroom/hooks/useResolvedClassFeatures';
import { useClasses } from '@/hooks/queries/useClasses';
import {
  allClassFeatures,
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
 *   - `/teacher/task-tree` is gated here on `enable_task_tree` and is a menu entry in the route
 *     table now that it has a label - it used to be listed here with no way to reach it at all.
 *   - `/teacher/verification` is the pickup counter for the *shop's* redemption tickets as well
 *     as lucky-draw prizes (`plugins/marketplace` mints a ticket on every purchase), so it shows
 *     when either feature is on - gating it on `enable_lucky_draw` alone hid the page from a
 *     shop-only class that still had codes to verify.
 *
 * ## "We cannot answer yet" is not "off"
 *
 * Two answers have to arrive before an entry may be hidden or a page redirected: the class list
 * (which class's flags to read) and that class's feature flags. Until both are known the shell is
 * given `allClassFeatures` and an empty `hiddenPaths`, so a hard refresh never flashes the rail
 * empty or bounces the page. A failed class-list read is rendered as its own error card with a
 * retry - it is not "this account has no classes", which is what the first-run wizard treats an
 * empty list as.
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
  '/teacher/verification': { anyOf: ['enable_shop', 'enable_lucky_draw'] },
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

  const classesQuery = useClasses();
  const classesReady = !classesQuery.isLoading && !classesQuery.isError;
  const classes = useMemo(() => (classesReady ? classesQuery.data ?? [] : []), [classesReady, classesQuery.data]);
  const classesError = Boolean(classesQuery.isError);
  const defaultClassId = useMemo(() => (classesReady ? classes[0]?.id ?? null : null), [classesReady, classes]);

  /**
   * The same resolver the student, parent and guard use.
   *
   * This layout used to read `classFeatureData?.features ?? defaultClassFeatures`, i.e. "every flag
   * off" until the request answered - and then act on it. On a hard refresh of a gated page
   * (`/teacher/shop`, `/teacher/economy`, the twelve others in `teacherMenuGates`) the effect below
   * ran against the all-false default and replaced the page with `/teacher` before the answer
   * arrived: refresh lost your place, and the back button lost it again. `canDecide` is the fix -
   * "we cannot answer yet" is not "the teacher turned it off".
   */
  const { features: classFeatures, canDecide } = useResolvedClassFeatures(defaultClassId, {
    refetchInterval: 5000,
  });

  /** Gates are only decided once both halves of the answer are known, for the same reason. */
  const canResolveGates = classesReady && canDecide;
  const features = canResolveGates ? classFeatures : allClassFeatures;

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
      canResolveGates
        ? Object.entries(teacherMenuGates)
            .filter(([, requirement]) => requirement)
            .filter(([, requirement]) => !isFeatureRequirementEnabled(classFeatures, requirement))
            .map(([path]) => path)
        : [],
    [canResolveGates, classFeatures],
  );

  const fallbackPath = useMemo(() => {
    // The first destination the teacher can actually use, in the fallback order below. While the
    // answer is pending there is no "unusable" entry to skip, so the console's own home is used and
    // the effect below does nothing until the flags arrive.
    if (!canResolveGates) return '/teacher';
    for (const path of GATE_ORDERED_PATHS) {
      if (isFeatureRequirementEnabled(classFeatures, teacherMenuGates[path])) return path;
    }
    return '/teacher';
  }, [canResolveGates, classFeatures]);

  useEffect(() => {
    // Never decide on "we cannot answer": that is what made a refresh of a gated page bounce.
    if (!canResolveGates) return;

    if (location.pathname === '/teacher' && fallbackPath !== '/teacher') {
      navigate(fallbackPath, { replace: true });
      return;
    }

    const requirement = teacherMenuGates[location.pathname];
    if (requirement && !isFeatureRequirementEnabled(classFeatures, requirement)) {
      navigate(fallbackPath, { replace: true });
    }
  }, [canResolveGates, fallbackPath, classFeatures, location.pathname, navigate]);

  if (!user) return null;

  return (
    <AppShell
      role="teacher"
      brand={{ label: '教师工作台', meta: '让每个课堂都发光', icon: GraduationCap }}
      fallbackTitle="教师工作台"
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
      {classesError ? (
        <ClassesUnavailableCard
          onRetry={() => void classesQuery.refetch()}
          isRetrying={Boolean(classesQuery.isFetching)}
        />
      ) : (
        <Outlet />
      )}
    </AppShell>
  );
}

/**
 * A failed class-list read, rendered where the page would be.
 *
 * It replaces the routed page on purpose: every teacher page resolves its class from this list, and
 * the dashboard's first-run wizard treats "no classes yet" as an invitation to create one. Showing
 * either over a failed request would state something the console does not know. The retry button is
 * the visible recovery path (the class query is shared, so one refetch fixes every page).
 */
function ClassesUnavailableCard({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div
      role="alert"
      data-testid="teacher-classes-error"
      className="mx-auto mt-10 max-w-xl rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center"
    >
      <p className="font-semibold text-danger">班级列表加载失败</p>
      <p className="mt-1 text-sm text-fg-3">这不代表你没有班级。请重试；在恢复之前，页面不会按“没有班级”处理。</p>
      <Button variant="outline" className="mt-4" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? '重新加载中…' : '重新加载'}
      </Button>
    </div>
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
