import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import { classroomApi as classFeaturesApi } from '@/features/classroom/api/classesApi';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { classFeatureLabels, defaultClassFeatures, type ClassFeatureKey, type ClassFeatures } from '@/lib/classFeatures';

const groups: Array<{ title: string; items: ClassFeatureKey[] }> = [
  { title: '课堂互动', items: ['enable_chat_bubble', 'enable_tree_hole', 'enable_danmaku', 'enable_peer_review', 'enable_achievements'] },
  { title: '商城与经济', items: ['enable_shop', 'enable_auction_blind_box', 'enable_gacha', 'enable_economy'] },
  { title: '战斗与活动', items: ['enable_challenge', 'enable_world_boss', 'enable_guild_pk', 'enable_class_brawl', 'enable_slg', 'enable_dungeon', 'enable_lucky_draw'] },
  // AI 智学 is a class feature like the other nineteen, and this panel is the only place a teacher
  // can switch one on: it was missing from this list, so `enable_ai_study` had no write path at all
  // in the web console - the student page, the teacher board and the mini program all read a flag
  // nobody could set. `class-feature-panel-coverage.test.ts` keeps this list complete now.
  { title: '学业成长', items: ['enable_task_tree', 'enable_ai_study'] },
  { title: '家校联动', items: ['enable_family_tasks', 'enable_parent_buff'] },
];

export default function ClassFeaturePanel({ classId, compact = false }: { classId: number | null; compact?: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useClassFeatures(classId);
  const [features, setFeatures] = useState<ClassFeatures>(defaultClassFeatures);

  useEffect(() => {
    if (data?.features) {
      setFeatures(data.features);
    }
  }, [data?.features]);

  const mutation = useMutation({
    mutationFn: async (payload: Partial<ClassFeatures>) => {
      if (!classId) return null;
      return classFeaturesApi.updateFeatures(classId, payload);
    },
    onSuccess: async (result) => {
      if (!classId || !result) return;
      setFeatures(result.features);
      await queryClient.invalidateQueries({ queryKey: ['class-features', classId] });
      toast.success('课堂功能已更新');
    },
  });

  const content = useMemo(() => groups, []);

  if (!classId) {
    return <div className="rounded-card border border-dashed border-line-1 p-8 text-center text-fg-3">请先选择班级</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-fg-3">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载课堂功能...
      </div>
    );
  }

  /**
   * A failed read is not "everything is off".
   *
   * `defaultClassFeatures` is all-false, so without this branch a request that failed painted every
   * switch as 「当前已关闭」 - the teacher's honest reading of that is "my settings were reset", and
   * the next tap would then write that guess back to the server.
   */
  if (isError) {
    return (
      <div className="rounded-card border border-danger/20 bg-danger/10 p-8 text-center">
        <p className="font-semibold text-danger">课堂功能开关加载失败</p>
        <p className="mt-1 text-sm text-fg-3">这不代表功能被关闭。请重试，避免在错误的状态上修改开关。</p>
        <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
          重新加载
        </Button>
      </div>
    );
  }

  const toggleFeature = async (key: ClassFeatureKey) => {
    const nextValue = !features[key];
    setFeatures((prev) => ({ ...prev, [key]: nextValue }));
    try {
      await mutation.mutateAsync({ [key]: nextValue });
    } catch {
      // The optimistic flip is rolled back; the api layer already toasted the server's reason,
      // so a second generic toast here only made one failure look like two.
      setFeatures((prev) => ({ ...prev, [key]: !nextValue }));
    }
  };

  return (
    <div className="space-y-6">
      {content.map((group) => (
        <section key={group.title} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-body font-semibold text-fg-1">{group.title}</h3>
            <span className="text-caption text-fg-3">{group.items.length} 项</span>
          </div>
          <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {group.items.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-card border border-line-1 bg-surface-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-body text-fg-1">{classFeatureLabels[key]}</div>
                  <div className="mt-0.5 text-caption text-fg-3">
                    {features[key] ? '已开启，学生可以看到' : '已关闭，学生看不到'}
                  </div>
                </div>
                <Switch
                  checked={features[key]}
                  onCheckedChange={() => void toggleFeature(key)}
                  disabled={mutation.isPending}
                  aria-label={classFeatureLabels[key]}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
