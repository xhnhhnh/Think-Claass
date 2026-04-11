import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { classFeaturesApi } from '@/api/classFeatures';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { classFeatureLabels, defaultClassFeatures, type ClassFeatureKey, type ClassFeatures } from '@/lib/classFeatures';

const groups: Array<{ title: string; items: ClassFeatureKey[] }> = [
  { title: '课堂互动', items: ['enable_chat_bubble', 'enable_tree_hole', 'enable_danmaku', 'enable_peer_review', 'enable_achievements'] },
  { title: '商城与经济', items: ['enable_shop', 'enable_auction_blind_box', 'enable_gacha', 'enable_economy'] },
  { title: '战斗与活动', items: ['enable_challenge', 'enable_world_boss', 'enable_guild_pk', 'enable_class_brawl', 'enable_slg', 'enable_dungeon', 'enable_lucky_draw'] },
  { title: '学业成长', items: ['enable_task_tree'] },
  { title: '家校联动', items: ['enable_family_tasks', 'enable_parent_buff'] },
];

export default function ClassFeaturePanel({ classId, compact = false }: { classId: number | null; compact?: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useClassFeatures(classId);
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
    return <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">请先选择班级</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载课堂功能...
      </div>
    );
  }

  const toggleFeature = async (key: ClassFeatureKey) => {
    const nextValue = !features[key];
    setFeatures((prev) => ({ ...prev, [key]: nextValue }));
    try {
      await mutation.mutateAsync({ [key]: nextValue });
    } catch {
      setFeatures((prev) => ({ ...prev, [key]: !nextValue }));
      toast.error('功能开关更新失败');
    }
  };

  return (
    <div className={`space-y-5 ${compact ? '' : 'bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60'}`}>
      {!compact && <h2 className="text-xl font-bold text-slate-800">课堂功能开关</h2>}
      {content.map((group) => (
        <div key={group.title} className="space-y-3">
          <h3 className="text-sm font-bold text-slate-500">{group.title}</h3>
          <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {group.items.map((key) => (
              <div key={key} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                <div className="pr-4">
                  <div className="font-semibold text-slate-800">{classFeatureLabels[key]}</div>
                  <div className="text-xs text-slate-500">{features[key] ? '当前已开启' : '当前已关闭'}</div>
                </div>
                <button
                  onClick={() => toggleFeature(key)}
                  disabled={mutation.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${features[key] ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-slate-300'} disabled:opacity-50`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${features[key] ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
