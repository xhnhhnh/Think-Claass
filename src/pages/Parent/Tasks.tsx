import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle, CheckSquare, Clock, Heart, Plus, Star, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import {
  useCreateFamilyTaskMutation,
  useDeleteFamilyTaskMutation,
  useFamilyTasks,
  useUpdateFamilyTaskStatusMutation,
} from '@/hooks/queries/useFamilyTasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
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
import { Spinner } from '@/components/ui/spinner';

interface FamilyTask {
  id: number;
  title: string;
  points: number;
  status: 'pending' | 'completed' | 'approved' | 'rejected';
  created_at: string;
}

/**
 * 家庭时光.
 *
 * The warm-paper styling this page carried - a hex background, a paper texture loaded
 * from a third-party URL, a fixed-overlay modal, its own spinner, its own empty block and
 * a `confirm()` - is the kit's now: `PageHeader`, `Card`, `Badge`, `Dialog` and
 * `ConfirmDialog`.
 *
 * `coral-*` was never a colour: `tailwind.config.js` does not register that family, so
 * every `bg-coral-*` in the parent pages compiled to nothing and the primary buttons had
 * no background at all. The parent theme's `primary` is the same orange, and it is real.
 */
export default function ParentTasks() {
  const user = useStore(state => state.user);
  const studentId = user?.studentId ?? null;
  const { data: tasks = [], isLoading: loading } = useFamilyTasks(studentId);
  const createMutation = useCreateFamilyTaskMutation(studentId);
  const updateMutation = useUpdateFamilyTaskStatusMutation(studentId);
  const deleteMutation = useDeleteFamilyTaskMutation(studentId);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPoints, setNewTaskPoints] = useState('');
  /** The row awaiting confirmation, held as an id so the dialog owns no task object. */
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskPoints || !user?.studentId) return;

    const points = parseInt(newTaskPoints);
    if (isNaN(points) || points <= 0) {
      toast.error('请输入有效的小红花数量');
      return;
    }

    try {
      await createMutation.mutateAsync({
        student_id: user.studentId,
        parent_id: user.id,
        title: newTaskTitle.trim(),
        points: points,
      });
      toast.success('新约定已记录');
      setShowAddModal(false);
      setNewTaskTitle('');
      setNewTaskPoints('');
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleUpdateStatus = async (task: FamilyTask, newStatus: 'approved' | 'rejected') => {
    try {
      await updateMutation.mutateAsync({
        taskId: task.id,
        status: newStatus,
        reward:
          newStatus === 'approved' && user?.studentId
            ? { studentId: user.studentId, amount: task.points, reason: `完成家庭约定: ${task.title}` }
            : undefined,
      });
      if (newStatus === 'approved') toast.success('约定已达成，小红花已颁发');
      else toast.success('约定需要改进');
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async () => {
    if (deleteTargetId === null) return;
    try {
      await deleteMutation.mutateAsync(deleteTargetId);
      toast.success('约定已删除');
    } catch (error) {
      toast.error('网络错误');
    } finally {
      // The old `confirm()` was dismissed before the request ran, so the dialog closes
      // either way and a failure is reported by the toast instead.
      setDeleteTargetId(null);
    }
  };

  if (!user?.studentId) {
    return (
      <EmptyState
        icon={Heart}
        className="mx-auto h-80 max-w-5xl"
        title="等待宝贝加入"
        description="您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。"
      />
    );
  }

  /**
   * Status chips. These were four hand-mixed stone/indigo/green/coral spans, each with
   * its own border and radius. `需要改进` is a `warning` rather than a `destructive`:
   * it is the teacher asking for another try, not a failure.
   */
  const getStatusBadge = (status: FamilyTask['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">进行中</Badge>;
      case 'completed':
        return <Badge variant="info">待查看</Badge>;
      case 'approved':
        return <Badge variant="success">已达成</Badge>;
      case 'rejected':
        return <Badge variant="warning">需要改进</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="家庭时光"
        description="和宝贝定下温馨的小约定，见证成长"
        icon={CheckSquare}
        actions={
          <Button type="button" onClick={() => setShowAddModal(true)}>
            <Plus data-icon="inline-start" />
            新约定
          </Button>
        }
      />

      <Card>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 font-medium tracking-widest text-ink-3">
              <Spinner label="正在加载家庭约定" />
              翻阅记录中...
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              className="border-0 bg-transparent"
              title="还没有约定哦，和宝贝制定第一个小目标吧"
            />
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col justify-between gap-4 rounded-panel border border-border bg-muted/50 p-5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-warning/10 text-warning">
                        <Star aria-hidden="true" className="size-5" />
                      </span>
                      <h3 className="text-base font-bold tracking-wide text-ink-1">{task.title}</h3>
                      {getStatusBadge(task.status)}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-4 pl-[3.25rem] text-sm text-ink-3">
                      <span className="flex items-center gap-1.5">
                        <Clock aria-hidden="true" className="size-4" />
                        {new Date(task.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1 rounded-pill bg-warning/10 px-2 py-0.5 font-bold text-warning">
                        <Heart aria-hidden="true" className="size-3.5 fill-current" />
                        {task.points} 朵小红花
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:pl-4">
                    {task.status === 'completed' && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="bg-success/10 font-bold text-success hover:bg-success/20 hover:text-success"
                          onClick={() => handleUpdateStatus(task, 'approved')}
                        >
                          <CheckCircle data-icon="inline-start" />
                          真棒
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="bg-warning/10 font-bold text-warning hover:bg-warning/20 hover:text-warning"
                          onClick={() => handleUpdateStatus(task, 'rejected')}
                        >
                          <XCircle data-icon="inline-start" />
                          再加油
                        </Button>
                      </>
                    )}
                    {(task.status === 'pending' || task.status === 'rejected') && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="删除约定"
                        title="删除约定"
                        className="text-ink-3 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTargetId(task.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新的约定</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-4">
            <FormField label="约定内容" required>
              <Input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="例如：自己整理书包、阅读半小时"
                required
              />
            </FormField>

            <FormField label="奖励小红花" required>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  value={newTaskPoints}
                  onChange={(e) => setNewTaskPoints(e.target.value)}
                  placeholder="如：5"
                  className="pl-9"
                  required
                />
                <Heart
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary"
                />
              </div>
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                再想想
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? '记录中...' : '定下约定'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="确定要删除这个约定吗？"
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
