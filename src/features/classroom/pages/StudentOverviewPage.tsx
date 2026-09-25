import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { useStore } from '@/store/useStore';
import { studentsApi } from '../api/studentsApi';
import { MotivationOverview } from '../components/MotivationOverview';

export default function StudentOverviewPage() {
  const user = useStore((state) => state.user);
  const studentId = user?.studentId ?? null;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['motivation-summary', studentId],
    queryFn: () => studentsApi.getSummary(studentId!),
    enabled: !!studentId,
  });
  const stageCopy = {
    general: '继续向前探索',
    primary: '今天也有新发现',
    middle: '看见稳步向前的自己',
    high: '为目标积累每一步',
  } as const;
  return (
    <PageScaffold variant="dashboard" title="成长总览" description="看见每一次成长、合作、竞技与参与。">
      <div className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card">
        <p className="text-sm text-fg-3">我的成长旅程</p>
        <h2 className="mt-1 text-2xl font-semibold text-fg-1">{user?.name || user?.username || '同学'}，{stageCopy[data?.summary.schoolStage ?? 'general']}</h2>
        {data?.summary && <p className="mt-2 text-sm text-fg-2">当前阶段：{data.summary.level} · 可用积分 {data.summary.availableCredits} 分。成长值不会因兑换减少。</p>}
      </div>
      {!studentId && <p className="rounded-panel border border-line-1 bg-surface-2 p-6 text-fg-2">尚未绑定学生档案，请联系老师完成绑定。</p>}
      {isLoading && <p className="rounded-panel border border-line-1 bg-surface-2 p-6 text-fg-3">正在载入四维成长…</p>}
      {isError && <div className="rounded-panel border border-danger/30 bg-danger-soft p-6 text-danger">成长数据暂时无法加载。<Button variant="outline" className="ml-3" onClick={() => void refetch()}>重试</Button></div>}
      {data?.summary && <MotivationOverview summary={data.summary} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/student/pet" className="group rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card transition-colors hover:border-success/40"><Sparkles className="mb-3 size-6 text-success" /><span className="font-semibold text-fg-1">看看我的精灵</span><ArrowRight className="ml-2 inline size-4 text-fg-3 group-hover:text-success" /></Link>
        <Link to="/student/assignments" className="group rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card transition-colors hover:border-info/40"><BookOpen className="mb-3 size-6 text-info" /><span className="font-semibold text-fg-1">继续学习任务</span><ArrowRight className="ml-2 inline size-4 text-fg-3 group-hover:text-info" /></Link>
      </div>
    </PageScaffold>
  );
}
