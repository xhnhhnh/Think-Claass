import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Map as MapIcon, Plus, Play, XCircle } from 'lucide-react';

import { useClasses } from '@/hooks/queries/useClasses';
import { useCreateTerritoryMutation, useTerritoryMap, useTriggerYieldMutation } from '@/features/slg/hooks/useTerritory';
import type { Territory, TerritoryType } from '@/features/slg/api/slgApi';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Select } from '@/components/ui/select';

/** Status → chip. The ternary chain that picked emerald/amber/slate is now a `Badge` variant. */
const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
  owned: { label: '已解锁', variant: 'success' },
  unlocking: { label: '收集中', variant: 'warning' },
};

/**
 * 领土扩张管理.
 *
 * The hand-rolled modal - a fixed overlay, a `framer-motion` scale-in and its own
 * close button - is the kit's `Dialog`, which brings the focus trap and the escape
 * handling the manual version never had. The list is a `DataTable`, so the page no
 * longer decides what an empty map looks like.
 *
 * Payloads, the `cost_to_unlock`/`x_pos`/`y_pos` conversions, both toast strings and
 * the "no class yet" early return are unchanged.
 */
export default function TeacherTerritory() {
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const classId = useMemo(() => classes[0]?.id ?? null, [classes]);
  const { data } = useTerritoryMap(classId);
  const territories = (data?.territories ?? []) as Territory[];
  const createMutation = useCreateTerritoryMutation();
  const yieldMutation = useTriggerYieldMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'forest' as TerritoryType,
    cost_to_unlock: 1000,
    x_pos: 0,
    y_pos: 0
  });

  const reloadMap = async () => {
    if (!classId) return;
    await queryClient.invalidateQueries({ queryKey: ['territory-map', classId] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;

    try {
      const data = await createMutation.mutateAsync({ ...formData, class_id: classId });
      if (data.success) {
        toast.success('领地已创建');
        setIsModalOpen(false);
        await reloadMap();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const triggerYield = async () => {
    if (!classId) return;
    try {
      const data = await yieldMutation.mutateAsync(classId);
      if (data.success) {
        toast.success('已模拟产出资源');
        await reloadMap();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const columns: Array<DataTableColumn<Territory>> = [
    { key: 'name', header: '领地名称', className: 'font-bold text-fg-2' },
    { key: 'type', header: '类型', className: 'capitalize text-fg-2' },
    { key: 'level', header: '等级', className: 'font-medium', render: (t) => `Lv.${t.level}` },
    {
      key: 'progress',
      header: '解锁进度',
      className: 'font-bold text-success',
      render: (t) => `${t.current_contribution} / ${t.cost_to_unlock}`,
    },
    {
      key: 'position',
      header: '坐标',
      className: 'font-mono text-fg-3',
      render: (t) => `(${t.x_pos}, ${t.y_pos})`,
    },
    {
      key: 'status',
      header: '状态',
      render: (t) => {
        const meta = STATUS_META[t.status];
        return <Badge variant={meta?.variant ?? 'outline'}>{meta?.label ?? '未解锁'}</Badge>;
      },
    },
  ];

  // The page's primary action, reachable from the command palette as well as the context bar.
  useRegisterPageCommands([
    {
      id: 'teacher-territory:create',
      label: '配置新领地',
      icon: Plus,
      keywords: ['领地', '地图', '解锁'],
      run: () => setIsModalOpen(true),
    },
  ]);

  if (!classId) {
    return (
      <PageScaffold variant="list">
        <div className="p-8 text-center text-fg-3">请先创建或选择一个班级</div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="list"
      title="领土扩张管理"
      description="配置大地图节点，设定解锁需要的全班积分捐献阈值。"
      actions={
        <>
          <Button type="button" variant="outline" onClick={triggerYield}>
            <Play data-icon="inline-start" />
            强制结算资源
          </Button>
          <Button type="button" onClick={() => setIsModalOpen(true)}>
            <Plus data-icon="inline-start" />
            配置新领地
          </Button>
        </>
      }
    >

      <Card className="rounded-panel">
        <CardContent className="p-6">
          <h3 className="mb-4 text-lg font-bold text-fg-1">领地列表</h3>
          <DataTable<Territory>
            columns={columns}
            rows={territories}
            getRowKey={(t) => t.id}
            empty={
              <EmptyState
                icon={MapIcon}
                title="暂无领地节点"
                description="点击右上角配置第一个领地节点"
                className="bg-surface-2"
              />
            }
          />
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建领地节点</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="领地名称" required>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="如: 叹息森林"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="地形产出类型">
                <Select
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as TerritoryType})}
                >
                  <option value="forest">森林 (木材)</option>
                  <option value="mine">矿洞 (石石)</option>
                  <option value="city">城邦 (金币)</option>
                  <option value="magic_spring">魔泉 (星尘)</option>
                </Select>
              </FormField>
              <FormField label="解锁所需总积分">
                <Input
                  type="number"
                  min="100"
                  value={formData.cost_to_unlock}
                  onChange={e => setFormData({...formData, cost_to_unlock: Number(e.target.value)})}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="X 坐标偏差 (px)">
                <Input
                  type="number"
                  value={formData.x_pos}
                  onChange={e => setFormData({...formData, x_pos: Number(e.target.value)})}
                />
              </FormField>
              <FormField label="Y 坐标偏差 (px)">
                <Input
                  type="number"
                  value={formData.y_pos}
                  onChange={e => setFormData({...formData, y_pos: Number(e.target.value)})}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                <XCircle data-icon="inline-start" />
                取消
              </Button>
              <Button type="submit">确认部署领地</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
