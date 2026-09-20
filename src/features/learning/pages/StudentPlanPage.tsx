import { useState } from 'react';
import { Calendar, CheckCircle2, LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { studyPlansApi } from '@/features/learning/api/studyPlansApi';
import { useStudyPlan } from '@/features/learning/hooks/useStudyPlan';

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-ink-3">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载学习计划...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-paper/80 backdrop-blur-xl p-6 rounded-panel border border-white/60 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-ink-1 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-primary" />
              学习计划
            </div>
            <div className="text-sm text-ink-3">当前为 MVP 版本：会基于错题自动生成练习任务</div>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-card text-sm font-medium bg-primary/5 text-primary border border-primary/10 hover:bg-primary/10 disabled:opacity-50 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建计划
          </Button>
        </div>
      </div>

      {!plan && (
        <div className="py-16 text-center text-ink-3">
          暂无计划，点击“新建计划”开始。
        </div>
      )}

      {plan && (
        <div className="space-y-4">
          {plan.study_plan_items.length === 0 && <div className="py-16 text-center text-ink-3">计划中暂无任务</div>}
          {plan.study_plan_items.map((item) => (
            <div key={item.id} className="bg-paper/80 backdrop-blur-xl p-6 rounded-panel border border-white/60 shadow-card">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-ink-1 truncate">
                    {item.kind === 'practice' ? '练习' : item.kind} {item.questions?.stem ? `· ${item.questions.stem}` : ''}
                    {item.knowledge_nodes?.name ? `· ${item.knowledge_nodes.name}` : ''}
                  </div>
                  <div className="text-sm text-ink-3">状态：{item.status} · 预计 {item.estimated_min ?? 0} 分钟</div>
                </div>
                {item.status !== 'done' && (
                  <Button variant="ghost"
                    onClick={() => handleMarkDone(item.id)}
                    className="px-4 py-2 rounded-card text-sm font-medium bg-success/10 text-success border border-success/20 hover:bg-success/20 flex items-center"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    标记完成
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
