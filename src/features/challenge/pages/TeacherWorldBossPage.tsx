import { useState } from 'react';
import { toast } from 'sonner';
import { Swords, Plus, Trash2, ShieldAlert, Trophy, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

import { useWorldBossMutation, useWorldBosses } from '@/features/challenge/hooks/useChallenge';
import type { WorldBossDto } from '@/features/challenge/types';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
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
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { SkeletonList } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

/**
 * 世界BOSS管理.
 *
 * The boss health bar is the one animated figure on the page - it keeps its animation
 * through `Progress`, whose fill is owned by Base UI instead of a `motion.div` width.
 * The rest of the page stops reinventing three states: the loading placeholder is the
 * kit's `SkeletonList`, the history table is `DataTable` (which owns its loading and
 * empty rows) and deleting an active boss asks through `ConfirmDialog` rather than the
 * browser's `confirm`.
 */
export default function TeacherWorldBoss() {
  const { data: bosses = [], isLoading: loading, refetch } = useWorldBosses();
  const bossMutation = useWorldBossMutation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hp: 10000,
    level: 1
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('请输入BOSS名称');
      return;
    }

    try {
      await bossMutation.mutateAsync({ type: 'create', data: formData });
      toast.success('召唤世界BOSS成功！');
      setIsModalOpen(false);
      setFormData({ name: '', description: '', hp: 10000, level: 1 });
      await refetch();
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await bossMutation.mutateAsync({ type: 'delete', id });
      toast.success('删除成功');
      await refetch();
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const activeBoss = bosses.find(b => b.status === 'active');
  const historyBosses = bosses.filter(b => b.status !== 'active');

  return (
    <div className="space-y-8">
      <PageHeader
        title="世界BOSS管理"
        description="召唤全班级别的超级大魔王，让学生们合作击败它获取奖励"
        icon={Swords}
        actions={
          <Button
            onClick={() => setIsModalOpen(true)}
            disabled={!!activeBoss}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <Plus data-icon="inline-start" />
            {activeBoss ? '当前已有存活的BOSS' : '召唤新BOSS'}
          </Button>
        }
      />

      {/* Active Boss Status */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-panel border border-destructive/20 bg-paper shadow-card"
      >
        <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-destructive to-warning" />
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center text-lg font-bold text-ink-1">
              <ShieldAlert className="mr-2 size-5 text-destructive" />
              当前战况
            </h3>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="刷新战况"
              title="刷新"
              onClick={() => refetch()}
            >
              <RefreshCw />
            </Button>
          </div>

          {loading ? (
            <SkeletonList count={3} itemClassName="h-4" />
          ) : activeBoss ? (
            <div className="rounded-card border border-destructive/20 bg-destructive/10 p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h4 className="flex items-center text-2xl font-black text-destructive">
                    {activeBoss.name}
                    <Badge variant="destructive" className="ml-3 font-bold">Lv.{activeBoss.level}</Badge>
                  </h4>
                  <p className="mt-1 text-ink-2">{activeBoss.description || '这只怪物非常可怕...'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除 ${activeBoss.name}`}
                  title="删除"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(activeBoss.id)}
                >
                  <Trash2 />
                </Button>
              </div>

              <div className="mt-8 space-y-2">
                <div className="flex justify-between text-sm font-bold text-ink-1">
                  <span>剩余血量</span>
                  <span>{activeBoss.hp} / {activeBoss.max_hp}</span>
                </div>
                <Progress
                  value={Math.max(0, (activeBoss.hp / activeBoss.max_hp) * 100)}
                  label="剩余血量"
                  tone="destructive"
                />
                <p className="mt-2 text-center text-xs text-ink-3">学生在前端挑战页面发起攻击将实时扣除此血量</p>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={ShieldAlert}
              title="当前风平浪静，没有世界BOSS入侵"
              className="bg-transparent"
            />
          )}
        </div>
      </motion.div>

      {/* History */}
      <div className="space-y-4">
        <h3 className="flex items-center text-lg font-bold text-ink-1">
          <Trophy className="mr-2 size-5 text-warning" />
          击杀记录
        </h3>
        <DataTable<WorldBossDto>
          columns={[
            { key: 'name', header: 'BOSS 名称', className: 'font-medium text-ink-1' },
            {
              key: 'level',
              header: '等级 / 总血量',
              className: 'text-ink-2',
              render: (boss) => `Lv.${boss.level} / ${boss.max_hp} HP`,
            },
            {
              key: 'status',
              header: '状态',
              render: () => <Badge variant="success">已击杀</Badge>,
            },
            {
              key: 'actions',
              header: <span className="sr-only">操作</span>,
              align: 'right',
              render: (boss) => (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除 ${boss.name}`}
                  title="删除"
                  className="text-ink-3 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(boss.id)}
                >
                  <Trash2 />
                </Button>
              ),
            },
          ]}
          rows={historyBosses}
          getRowKey={(boss) => boss.id}
          empty={
            <EmptyState
              icon={Trophy}
              title="暂无历史击杀记录"
              className="bg-paper"
            />
          }
        />
      </div>

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Swords className="mr-2 size-5 text-destructive" />
              召唤世界BOSS
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="BOSS 名称" required>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="例如：深渊魔龙、期末考试怪"
              />
            </FormField>

            <FormField label="BOSS 描述">
              <Textarea
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="描述一下这个可怕的怪物..."
                rows={3}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="总血量 (HP)" required>
                <Input
                  type="number"
                  required
                  min="100"
                  step="100"
                  value={formData.hp}
                  onChange={e => setFormData({...formData, hp: Number(e.target.value)})}
                />
              </FormField>
              <FormField label="等级 (Level)" required>
                <Input
                  type="number"
                  required
                  min="1"
                  max="100"
                  value={formData.level}
                  onChange={e => setFormData({...formData, level: Number(e.target.value)})}
                />
              </FormField>
            </div>
            <p className="mt-2 text-xs text-ink-3">* 击败后全班学生将获得 Level × 50 的积分奖励</p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                确认召唤
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确定要删除这个世界BOSS吗？"
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={bossMutation.isPending}
        onConfirm={async () => {
          if (deleteTarget === null) return;
          await handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
