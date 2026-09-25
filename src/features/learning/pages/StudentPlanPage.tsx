import { useState } from 'react';
import { Calendar, CheckCircle2, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';

import { studyPlansApi } from '@/features/learning/api/studyPlansApi';
import { useStudyPlan } from '@/features/learning/hooks/useStudyPlan';

/**
 * 学习计划.
 *
 * The `detail` variant: the plan's items are the main column and the summary -
 * counts derived from the items already in hand, no extra request - is the rail,
 * which is what makes the plan's shape readable at a glance.
 *
 * `新建计划` is the page's one action, so it is both the scaffold's `actions` slot
 * (the shell's context bar when there is one) and a command in the palette. The
 * create call, the item update, the invalidation and every label are unchanged.
 */
export default function StudentPlan() {
  const queryClient = useQueryClient();
  const { data: plan, isLoading } = useStudyPlan();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await studyPlansApi.create({});
      await queryClient.invalidateQueries({ queryKey: ['study-plan', 'my'] });
      toast.success('已创建计划');
    } catch (e) {
    } finally {
      setCreating(false);
    }
  };

  const handleMarkDone = async (itemId: number) => {
    try {
      await studyPlansApi.updateItem(itemId, { status: 'done' });
      await queryClient.invalidateQueries({ queryKey: ['study-plan', 'my'] });
      toast.success('已完成');
    } catch (e) {}
  };

  // The one action this page owns. Its runner only touches stable references
  // (setters, the query client, the api module), so the registry's structural key
  // is enough - there is no page state for a stale closure to read.
  useRegisterPageCommands([
    {
      id: 'study-plan:create',
      label: '新建计划',
      icon: Plus,
      disabled: creating,
      run: () => {
        void handleCreate();
      },
    },
  ]);

  if (isLoading) {
    return (
      <PageScaffold variant="detail" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在加载学习计划" />
          正在加载学习计划...
        </div>
      </PageScaffold>
    );
  }

  const items = plan?.study_plan_items ?? [];
  const doneCount = items.filter((item) => item.status === 'done').length;
  const totalMinutes = items.reduce((sum, item) => sum + (item.estimated_min ?? 0), 0);

  return (
    <PageScaffold
      variant="detail"
      title="学习计划"
      description="当前为 MVP 版本：会基于错题自动生成练习任务"
      actions={
        <Button onClick={handleCreate} disabled={creating}>
          <Plus aria-hidden="true" className="size-4" />
          新建计划
        </Button>
      }
      rail={
        plan ? (
          <SectionCard title="计划概览">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-3">任务总数</dt>
                <dd className="font-semibold text-fg-1">{items.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-3">已完成</dt>
                <dd className="font-semibold text-success">{doneCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-3">预计总时长</dt>
                <dd className="font-semibold text-fg-1">{totalMinutes} 分钟</dd>
              </div>
            </dl>
          </SectionCard>
        ) : undefined
      }
    >
      {!plan ? (
        <EmptyState icon={Calendar} title="暂无计划，点击“新建计划”开始。" />
      ) : items.length === 0 ? (
        <EmptyState icon={Calendar} title="计划中暂无任务" />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card transition-colors hover:border-role/30"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-bold text-fg-1">
                    {item.kind === 'practice' ? '练习' : item.kind}{' '}
                    {item.questions?.stem ? `· ${item.questions.stem}` : ''}
                    {item.knowledge_nodes?.name ? `· ${item.knowledge_nodes.name}` : ''}
                  </div>
                  <div className="mt-1 text-sm text-fg-3">
                    状态：{item.status} · 预计 {item.estimated_min ?? 0} 分钟
                  </div>
                </div>
                {item.status !== 'done' && (
                  <Button
                    variant="outline"
                    onClick={() => handleMarkDone(item.id)}
                    className="shrink-0 border-success/30 text-success-ink hover:bg-success-soft hover:text-success-ink"
                  >
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    标记完成
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
