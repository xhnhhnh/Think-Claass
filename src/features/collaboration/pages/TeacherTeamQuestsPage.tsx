import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle, PlusCircle, Target, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { teamQuestsApi, type TeamQuest } from '@/features/collaboration/api/teamQuestsApi';
import { useTeamQuestGroupProgress, useTeamQuests } from '@/features/collaboration/hooks/useTeamQuests';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * 团队任务.
 *
 * The quest cards keep their red target identity - the token for it is `destructive`,
 * which is what the page was spelling `red-500`/`red-50`/`red-100`. Both hand-built
 * overlays became kit dialogs, and the two per-group bars, whose fill used to be a
 * `style={{ width }}` on a `<div>`, are now `Progress` with a tone instead of a colour
 * string chosen inline.
 */
export default function TeacherTeamQuests() {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const classId = user?.class_id ?? 1;
  const teacherId = user?.id ?? 1;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [currentQuest, setCurrentQuest] = useState<TeamQuest | null>(null);

  const { data: quests = [], isLoading, error } = useTeamQuests(classId);
  const {
    data: progressData = [],
    isLoading: isProgressLoading,
  } = useTeamQuestGroupProgress(currentQuest?.id ?? null, classId, showProgressModal);

  const createMutation = useMutation({
    mutationFn: teamQuestsApi.createTeamQuest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team-quests', classId] });
      toast.success('团队任务发布成功');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPoints('');
      setNewTarget('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: teamQuestsApi.deleteTeamQuest,
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['team-quests', classId] });
      if (currentQuest?.id === deletedId) {
        setCurrentQuest(null);
        setShowProgressModal(false);
      }
      toast.success('团队任务已删除');
    },
  });

  const currentQuestOverallPercent = useMemo(() => {
    if (!currentQuest || progressData.length === 0) return 0;
    const totalProgress = progressData.reduce((sum, item) => sum + item.contribution_score, 0);
    const totalTarget = currentQuest.target_score * progressData.length;
    if (totalTarget <= 0) return 0;
    return Math.min(100, Math.round((totalProgress / totalTarget) * 100));
  }, [currentQuest, progressData]);

  const handleCreateQuest = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPoints || !newTarget) return;

    await createMutation.mutateAsync({
      class_id: classId,
      teacher_id: teacherId,
      title: newTitle.trim(),
      description: newDesc.trim(),
      target_score: parseInt(newTarget, 10),
      reward_points: parseInt(newPoints, 10),
    });
  };

  const handleDeleteQuest = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const openProgressModal = (quest: TeamQuest) => {
    setCurrentQuest(quest);
    setShowProgressModal(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="团队任务"
        icon={Target}
        actions={
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <PlusCircle data-icon="inline-start" />
            发布团队任务
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center gap-2 rounded-panel border border-border bg-paper/80 py-16 text-ink-3 backdrop-blur-xl">
          <Spinner label="正在加载团队任务" />
          正在加载团队任务...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-panel border border-destructive/20 bg-destructive/10 px-6 py-10 text-center text-destructive">
          团队任务加载失败，请稍后重试
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {quests.map((quest) => (
            <motion.div
              key={quest.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative flex h-full flex-col rounded-panel border border-border bg-paper/80 p-6 backdrop-blur-xl transition-shadow hover:shadow-raised"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-card bg-destructive/10 p-2 text-destructive">
                    <Award className="size-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-ink-1">{quest.title}</h3>
                    <Badge variant={quest.status === 'active' ? 'info' : 'secondary'}>
                      {quest.status === 'active' ? '进行中' : '已结束'}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除团队任务 ${quest.title}`}
                  title="删除"
                  disabled={deleteMutation.isPending}
                  className="text-ink-3 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteQuest(quest.id)}
                >
                  <Trash2 />
                </Button>
              </div>

              <div className="mb-6 flex-grow text-sm text-ink-2">
                <p className="mb-2">{quest.description || '暂无任务描述'}</p>
                <div className="mt-4 flex flex-wrap gap-4">
                  <Badge variant="warning" className="h-auto px-3 py-1.5">
                    <span className="text-xs">奖励积分</span>
                    <span className="font-bold">{quest.reward_points} 币/组</span>
                  </Badge>
                  <Badge variant="info" className="h-auto px-3 py-1.5">
                    <span className="text-xs">目标进度</span>
                    <span className="font-bold">{quest.target_score} 次/组</span>
                  </Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-ink-3">
                  <p>开始时间：{quest.start_date || '未设置'}</p>
                  <p>截止时间：{quest.end_date || '未设置'}</p>
                </div>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => openProgressModal(quest)}
              >
                <Users data-icon="inline-start" />
                查看各组进度
              </Button>
            </motion.div>
          ))}
          {quests.length === 0 && (
            <EmptyState
              icon={Target}
              title="暂无发布的团队任务"
              className="col-span-full bg-paper/80"
            />
          )}
        </div>
      )}

      <Dialog open={showCreateModal} onOpenChange={(open) => !open && setShowCreateModal(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发布团队任务</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateQuest} className="space-y-4">
            <FormField label="任务名称" required>
              <Input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：书香班级挑战"
              />
            </FormField>
            <FormField label="任务描述" required>
              <Textarea
                required
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="说明任务内容..."
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="每组目标数量" required>
                <Input
                  type="number"
                  required
                  min="1"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="例如: 10"
                />
              </FormField>
              <FormField label="达成奖励(积分)" required>
                <Input
                  type="number"
                  required
                  min="1"
                  value={newPoints}
                  onChange={(e) => setNewPoints(e.target.value)}
                  placeholder="例如: 50"
                />
              </FormField>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {createMutation.isPending ? '发布中...' : '确认发布'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {currentQuest && (
        <Dialog open={showProgressModal} onOpenChange={(open) => !open && setShowProgressModal(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>各组进度</DialogTitle>
              <DialogDescription>
                {currentQuest.title}（目标：{currentQuest.target_score}）
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <p className="text-xs text-ink-3">总体进度：{currentQuestOverallPercent}%</p>
              <Progress value={currentQuestOverallPercent} label="总体进度" />
            </div>

            <div className="max-h-[50vh] space-y-5 overflow-y-auto">
              {isProgressLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-ink-3">
                  <Spinner label="正在加载进度" />
                  正在加载进度...
                </div>
              )}

              {!isProgressLoading && progressData.length === 0 && (
                <EmptyState
                  icon={Users}
                  title="暂无可展示的分组进度"
                  className="bg-transparent"
                />
              )}

              {!isProgressLoading &&
                progressData.map((progress) => {
                  const percent = currentQuest.target_score > 0
                    ? Math.min(100, Math.round((progress.contribution_score / currentQuest.target_score) * 100))
                    : 0;
                  const isCompleted = progress.contribution_score >= currentQuest.target_score;

                  return (
                    <div key={`${progress.group_id ?? 'ungrouped'}-${progress.group_name}`} className="rounded-card border border-border bg-muted/50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center text-lg font-bold text-ink-1">
                          {progress.group_name}
                          {isCompleted && <CheckCircle className="ml-2 size-5 text-success" />}
                        </span>
                        <span className={cn('font-bold', isCompleted ? 'text-success' : 'text-ink-2')}>
                          {progress.contribution_score} / {currentQuest.target_score}
                        </span>
                      </div>
                      <Progress
                        value={percent}
                        label={`${progress.group_name} 进度`}
                        tone={isCompleted ? 'success' : 'info'}
                      />
                    </div>
                  );
                })}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowProgressModal(false)}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
