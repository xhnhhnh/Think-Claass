import { useStore } from '@/store/useStore';
import { CheckCircle, Clock, Star, TrendingUp, ChevronRight, Heart, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { useParentBuffMutation, useParentDashboard } from '@/hooks/queries/useParentDashboard';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { useResolvedClassFeatures } from '@/features/classroom/hooks/useResolvedClassFeatures';
import { getRankTier } from '@/lib/rankTier';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { useQuery } from '@tanstack/react-query';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { classroomApi } from '@/features/classroom/api/classesApi';
import { MotivationOverview } from '@/features/classroom/components/MotivationOverview';

interface StudentInfo {
  id: number;
  name: string;
  total_points: number;
  available_points: number;
  class_id: number;
  group_name?: string;
}

interface Record {
  id: number;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

interface FamilyTask {
  id: number;
  title: string;
  points: number;
  status: string;
}

export default function ParentDashboard() {
  const user = useStore(state => state.user);
  const navigate = useNavigate();
  const studentId = user?.studentId ?? null;
  // Live class flags, not the login-time snapshot: the two switches below gate a button, and a
  // teacher turning one on should not require the parent to log in again to see it.
  const classId = Number(user?.classId ?? user?.class_id) || null;
  const { features: classFeatures } = useResolvedClassFeatures(classId, { refetchInterval: 5000 });
  const familyTasksEnabled = classFeatures.enable_family_tasks;
  const parentBuffEnabled = classFeatures.enable_parent_buff;
  const { data, isLoading: loading } = useParentDashboard(studentId);
  const castBuffMutation = useParentBuffMutation(studentId);
  const student = (data?.student ?? null) as StudentInfo | null;
  const summaryQuery = useQuery({ queryKey: ['motivation-summary', studentId], queryFn: () => studentsApi.getSummary(studentId!), enabled: !!studentId });
  const policyQuery = useQuery({ queryKey: ['incentive-policy', classId], queryFn: () => classroomApi.getIncentivePolicy(classId!), enabled: !!classId });
  const records = ((data?.records ?? []) as Record[]).slice(0, 5);
  const tasks = ((data?.tasks ?? []) as FamilyTask[]).slice(0, 5);
  const buffActive = !!summaryQuery.data?.summary.parentBlessingActive;
  const buffLoading = castBuffMutation.isPending;

  const castParentBuff = async () => {
    if (!parentBuffEnabled) {
      toast.info('老师开启家长祝福后，就可以给孩子送上今日鼓励啦');
      return;
    }

    if (buffActive) {
      toast.info('今日已经施放过祝福啦！');
      return;
    }
    try {
      await castBuffMutation.mutateAsync();
      toast.success('✨ 母爱的祝福已施放！');
      void launchConfetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: [...CELEBRATION.brand],
      });
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const pendingTasksCount = tasks.filter(t => t.status === 'pending' || t.status === 'completed').length;

  // Called before the two early returns below, so the hook order never changes.
  useRegisterPageCommands([
    {
      id: 'parent-dashboard:report',
      label: '完整足迹',
      icon: TrendingUp,
      keywords: ['成长报告', '记录'],
      run: () => navigate('/parent/report'),
    },
    {
      id: 'parent-dashboard:tasks',
      label: '查看家庭任务',
      icon: CheckCircle,
      keywords: ['家庭时光', '约定'],
      run: () => navigate('/parent/tasks'),
      disabled: !familyTasksEnabled,
    },
    {
      id: 'parent-dashboard:buff',
      label: '施放母爱的祝福',
      icon: Wand2,
      keywords: ['祝福', '积分加成'],
      run: () => void castParentBuff(),
      disabled: !parentBuffEnabled || buffActive || buffLoading,
    },
  ]);

  if (!user?.studentId) {
    return (
      <PageScaffold variant="dashboard" title="温馨家园" description="记录孩子的每一步">
        <EmptyState
          icon={Heart}
          className="mx-auto h-80 max-w-5xl"
          title="等待绑定学生档案"
          description="您的账号尚未绑定学生档案，请联系老师获取邀请码完成绑定。"
        />
      </PageScaffold>
    );
  }

  if (loading) {
    return (
      <PageScaffold variant="dashboard" title="温馨家园" description="记录孩子的每一步">
        <div className="flex h-64 items-center justify-center font-medium text-fg-3">翻阅日记中...</div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold variant="dashboard" title="温馨家园" description="记录孩子的每一步">
      {summaryQuery.data?.summary && <MotivationOverview summary={summaryQuery.data.summary} />}
      {summaryQuery.isLoading && <p className="rounded-panel border border-line-1 bg-surface-2 p-4 text-sm text-fg-3">正在载入四维成长…</p>}
      {summaryQuery.isError && <div className="rounded-panel border border-danger/20 bg-danger-soft p-4 text-sm text-danger">四维成长暂时无法加载。<Button variant="outline" className="ml-3" onClick={() => void summaryQuery.refetch()}>重试</Button></div>}
      {student && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="relative col-span-1 overflow-hidden rounded-panel border border-line-1 bg-surface-2 p-8 text-fg-1 shadow-card md:col-span-2">
            <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 opacity-10">
              <Star className="size-64" />
            </div>
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <h2 className="mb-3 text-4xl font-bold">{student.name}</h2>
                <div className="mt-5 flex items-center space-x-4">
                  <div className="rounded-card border border-line-1 bg-surface-3 px-5 py-2.5">
                    <p className="text-sm font-medium text-fg-2">成长阶段</p>
                    <p className="text-xl font-bold">{getRankTier(student.total_points)}</p>
                  </div>
                  <div className="rounded-card border border-line-1 bg-surface-3 px-5 py-2.5">
                    <p className="text-sm font-medium text-fg-2">伙伴小队</p>
                    <p className="text-xl font-bold">{student.group_name || '探索中'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-line-1 pt-6">
              <div>
                <p className="mb-1 font-medium text-fg-2">累计成长值</p>
                <p className="text-4xl font-bold">{student.total_points}</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-fg-2">可用积分</p>
                <p className="text-4xl font-bold text-success">{student.available_points}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-panel border border-warning/10 bg-surface-2 p-7 shadow-raised transition-all duration-300 hover:shadow-raised">
            <div>
              <div className="mb-5 flex items-center justify-between">
                <h3 className="flex items-center text-xl font-bold text-fg-1">
                  <div className="mr-3 flex size-10 items-center justify-center rounded-card bg-success-soft">
                    <CheckCircle className="size-5 text-success" />
                  </div>
                  家庭时光
                </h3>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-fg-3">
                一起完成家庭任务，记录每一次交流与合作。
              </p>
              <div className="flex items-center justify-between rounded-card border border-warning/20 bg-warning p-4">
                <span className="font-medium text-warning-ink">等待您查收</span>
                <span className="rounded-xl bg-role px-3 py-1 text-sm font-bold text-role-contrast shadow-card">
                  {pendingTasksCount}
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {/* The tapped control was a raw `motion.button`; the kit's `Button` is the
                  element, and the spring is the `motion.div` around it. */}
              <motion.div whileTap={{ scale: 0.95 }}>
                <Button
                  type="button"
                  onClick={castParentBuff}
                  disabled={!parentBuffEnabled || buffActive || buffLoading}
                  /* `min-h` rather than `h-auto`: the kit's `h-control` is emitted after
                     the height utilities, so only a min-height can restore the 3.5rem this
                     call-to-action had as a raw `motion.button`. */
                  className={`flex min-h-[3.5rem] w-full items-center justify-center space-x-2 rounded-card py-3.5 font-bold shadow-card transition-all ${
                    !parentBuffEnabled || buffActive
                      ? 'border border-warning/30 bg-warning-soft text-warning-ink'
                      : 'bg-gradient-to-r from-role to-role-ink text-role-contrast hover:shadow-raised hover:shadow-role/30'
                  }`}
                >
                  <Wand2 className="size-5" />
                  <span>
                    {!parentBuffEnabled
                      ? '老师开启后可送祝福'
                      : buffActive
                        ? '今日祝福已送达'
                        : `送上今日祝福（教师评分加成 ${policyQuery.data?.policy.parentBonusPercent ?? 0}%）`}
                  </span>
                </Button>
              </motion.div>

              {familyTasksEnabled ? (
                <Button
                  type="button"
                  onClick={() => navigate('/parent/tasks')}
                  className="flex h-auto w-full items-center justify-center space-x-2 bg-surface-3 font-medium text-fg-2 transition-colors hover:bg-surface-steel"
                >
                  <span>查看家庭任务</span>
                  <ChevronRight className="size-4" />
                </Button>
              ) : (
                <div className="rounded-card border border-warning/20 bg-warning-soft px-4 py-3 text-center text-sm font-medium text-warning-ink">
                  老师开启家庭任务后，这里会出现亲子约定
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 近期记录 */}
        <div className="rounded-panel border border-warning/10 bg-surface-2 p-7 shadow-raised">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center text-xl font-bold text-fg-1">
              <div className="mr-3 flex size-10 items-center justify-center rounded-card bg-role-soft">
                <TrendingUp className="size-5 text-role" />
              </div>
              闪光时刻
            </h3>
            <Button
              type="button"
              onClick={() => navigate('/parent/report')}
              className="h-auto rounded-xl bg-role px-3 py-1.5 text-sm font-medium text-role-contrast transition-colors hover:bg-role/90"
            >
              完整足迹
            </Button>
          </div>
          <div className="space-y-4">
            {records.length > 0 ? (
              records.map(record => (
                <div key={record.id} className="flex items-center justify-between rounded-card border border-transparent bg-surface-3/50 p-4 transition-colors hover:border-line-1 hover:bg-surface-3">
                  <div className="flex items-center">
                    <div className={`mr-4 rounded-xl p-2.5 ${record.amount > 0 ? 'bg-success-soft text-success' : 'bg-role-soft text-role'}`}>
                      {record.amount > 0 ? <Star className="size-5" /> : <TrendingUp className="size-5 rotate-180" />}
                    </div>
                    <div>
                      <p className="font-medium text-fg-1">{record.description}</p>
                      <p className="mt-1.5 text-xs text-fg-3">
                        {new Date(record.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${record.amount > 0 ? 'text-success' : 'text-role'}`}>
                    {record.amount > 0 ? '+' : ''}{record.amount}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-card border border-dashed border-line-1 bg-surface-3/50 py-10 text-center">
                <p className="text-fg-3">还没有新的记录哦</p>
              </div>
            )}
          </div>
        </div>

        {/* 近期任务 */}
        <div className="rounded-panel border border-warning/10 bg-surface-2 p-7 shadow-raised">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center text-xl font-bold text-fg-1">
              <div className="mr-3 flex size-10 items-center justify-center rounded-card bg-warning-soft">
                <Clock className="size-5 text-warning" />
              </div>
              最近的约定
            </h3>
            {familyTasksEnabled ? (
              <Button
                type="button"
                onClick={() => navigate('/parent/tasks')}
                className="h-auto rounded-xl bg-warning-soft px-3 py-1.5 text-sm font-medium text-warning-ink transition-colors hover:bg-warning/20"
              >
                所有约定
              </Button>
            ) : null}
          </div>
          <div className="space-y-4">
            {tasks.length > 0 ? (
              tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between rounded-card border border-transparent bg-surface-3/50 p-4 transition-colors hover:border-line-1 hover:bg-surface-3">
                  <div>
                    <h4 className="font-medium text-fg-1">{task.title}</h4>
                    <div className="mt-2.5 flex items-center space-x-2">
                      <span className="rounded-lg border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-ink">
                        {task.points} 朵小红花
                      </span>
                      <span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                        task.status === 'pending' ? 'border-line-1 bg-surface-3/50 text-fg-2' :
                        task.status === 'completed' ? 'border-info/30 bg-info-soft text-info-ink' :
                        task.status === 'approved' ? 'border-success/30 bg-success-soft text-success' :
                        'border-role/30 bg-role-soft text-role-ink'
                      }`}>
                        {task.status === 'pending' ? '进行中' :
                         task.status === 'completed' ? '待查看' :
                         task.status === 'approved' ? '已达成' : '需要改进'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-card border border-dashed border-line-1 bg-surface-3/50 py-10 text-center">
                <p className="text-fg-3">
                  {familyTasksEnabled ? '没有进行中的约定' : '家庭任务开启后，这里会同步亲子约定'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
