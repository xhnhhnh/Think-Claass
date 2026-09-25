import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { classroomApi, type IncentivePolicy } from '../api/classesApi';

export function IncentivePolicyPanel({ classId }: { classId: number }) {
  const queryClient = useQueryClient();
  const { data, isError, isLoading, refetch } = useQuery({ queryKey: ['incentive-policy', classId], queryFn: () => classroomApi.getIncentivePolicy(classId) });
  const [draft, setDraft] = useState<Omit<IncentivePolicy, 'classId'>>({ schoolStage: 'general', parentBonusPercent: 0, teamRankingsVisible: true });
  useEffect(() => { if (data?.policy) setDraft(data.policy); }, [data]);
  const mutation = useMutation({
    mutationFn: () => classroomApi.updateIncentivePolicy(classId, draft),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['incentive-policy', classId] }); toast.success('班级激励策略已保存'); },
    onError: () => toast.error('保存失败，设置已保留，请重试'),
  });
  if (isLoading) return <p className="text-sm text-fg-3">正在加载班级策略…</p>;
  if (isError) return <div className="flex items-center gap-3 text-sm text-danger">策略加载失败 <Button variant="outline" onClick={() => void refetch()}>重试</Button></div>;
  return (
    <section className="rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card" aria-label="班级激励策略">
      <div className="mb-4"><h2 className="font-semibold text-fg-1">班级激励策略</h2><p className="text-sm text-fg-3">学段影响文案；家长祝福只加成教师正向评分。</p></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-fg-2">学段
          <Select className="mt-1 w-full rounded-md border border-line-1 bg-surface-2 p-2" value={draft.schoolStage} onChange={(event) => setDraft({ ...draft, schoolStage: event.target.value as IncentivePolicy['schoolStage'] })}>
            <option value="general">通用</option><option value="primary">小学</option><option value="middle">中学</option><option value="high">高中</option>
          </Select>
        </label>
        <label className="text-sm text-fg-2">家长祝福加成
          <Select className="mt-1 w-full rounded-md border border-line-1 bg-surface-2 p-2" value={draft.parentBonusPercent} onChange={(event) => setDraft({ ...draft, parentBonusPercent: Number(event.target.value) })}>
            {[0, 5, 10, 15, 20].map((value) => <option key={value} value={value}>{value}%</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-2"><Checkbox checked={draft.teamRankingsVisible} onCheckedChange={(checked) => setDraft({ ...draft, teamRankingsVisible: checked === true })} />公开本周小组榜</label>
      </div>
      <div className="mt-4 flex justify-end"><Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '保存中…' : '保存策略'}</Button></div>
    </section>
  );
}
