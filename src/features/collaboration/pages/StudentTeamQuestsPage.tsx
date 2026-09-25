import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckSquare, MessageCircle, ShieldAlert, Star, Target, Users } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { teamQuestsApi } from '@/features/collaboration/api/teamQuestsApi';
import { useStudentCurrentTeamQuest } from '@/features/collaboration/hooks/useTeamQuests';
import { useStore } from '@/store/useStore';

/**
 * 团队任务.
 *
 * A `list` page: the orange banner that repeated the page title is gone - the shell's
 * context bar prints it - and its line of copy is the scaffold's description. The
 * quest summary, the hand-built progress bar (now the kit's `Progress`, which owns
 * the one value a page cannot write as a class) and the peer-review form keep their
 * place, their entrance and their copy.
 *
 * The review form is deliberately unchanged in structure: the star buttons are the
 * first five controls inside a member's card, in order, because that is what the
 * page's test drives (`within(card).getAllByRole('button')[3]` is the fourth star).
 * The mutation, the per-member scoring, the comment trim and the refetch are
 * untouched; 提交互评 is also registered as a palette command, and it runs through a
 * ref holding the latest handler because it reads the rating/comment state that the
 * registry's `id`+`disabled` key does not track.
 */
export default function StudentTeamQuests() {
  const user = useStore((state) => state.user);
  const studentId = user?.studentId ?? null;
  const { data, isLoading, error, refetch } = useStudentCurrentTeamQuest(studentId);
  const [reviewForm, setReviewForm] = useState<Record<number, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({});
  const shouldReduceMotion = useReducedMotion();

  const quest = data?.quest ?? null;
  const members = data?.team?.members ?? [];
  const myStudentId = user?.studentId ?? null;
  const otherMembers = useMemo(
    () => members.filter((member) => member.id !== myStudentId),
    [members, myStudentId],
  );
  const teamProgressPercent = quest && data?.progress
    ? Math.min(100, Math.round((data.progress.team_contribution_score / Math.max(quest.target_score, 1)) * 100))
    : 0;

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!quest || !myStudentId) {
        throw new Error('当前无法提交互评')
      }

      await Promise.all(
        otherMembers.map((member) => {
          const score = reviewForm[member.id];
          if (!score) {
            throw new Error('请为所有组员打分！')
          }

          return teamQuestsApi.submitPeerReview({
            reviewer_id: myStudentId,
            reviewee_id: member.id,
            team_quest_id: quest.id,
            score,
            comment: reviewComments[member.id]?.trim() || undefined,
          });
        }),
      );
    },
    onSuccess: async () => {
      setReviewForm({});
      setReviewComments({});
      toast.success('同伴评价提交成功！');
      await refetch();
    },
  });

  const handleRatingChange = (memberId: number, rating: number) => {
    setReviewForm((prev) => ({ ...prev, [memberId]: rating }));
  };

  const handleCommentChange = (memberId: number, comment: string) => {
    setReviewComments((prev) => ({ ...prev, [memberId]: comment }));
  };

  const submitPeerReview = async () => {
    if (!quest) {
      toast.error('当前没有可评价的团队任务');
      return;
    }

    if (otherMembers.length === 0) {
      toast.error('当前没有可评价的组员');
      return;
    }

    try {
      await reviewMutation.mutateAsync();
    } catch (mutationError: any) {
      toast.error(mutationError.message || '提交失败，请重试');
    }
  };

  // The latest handler, so a palette submit sends the ratings and comments as they are
  // now rather than as they were when the command was registered.
  const submitRef = useRef(submitPeerReview);
  useEffect(() => {
    submitRef.current = submitPeerReview;
  });

  useRegisterPageCommands([
    {
      id: 'team-quests:submit-peer-review',
      label: '提交互评',
      icon: MessageCircle,
      disabled: reviewMutation.isPending || !quest || otherMembers.length === 0,
      run: () => void submitRef.current(),
    },
  ]);

  return (
    <PageScaffold variant="list" title="团队任务" description="协作完成挑战，共同成长！">
      {isLoading && (
        <div className="flex items-center justify-center gap-3 rounded-panel border border-line-1 bg-surface-2 p-10 text-fg-3 shadow-card">
          <Spinner label="正在加载团队任务" />
          正在加载团队任务...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-panel border border-danger/20 bg-danger-soft p-10 text-center text-danger-ink">
          团队任务加载失败，请稍后重试
        </div>
      )}

      {!isLoading && !error && !quest && (
        <EmptyState icon={Users} title="当前没有进行中的团队任务" />
      )}

      {!isLoading && !error && quest && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: -16 }) }}
              animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
              className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card md:p-8"
            >
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <h2 className="flex items-center text-2xl font-black text-fg-1">
                  <Target aria-hidden="true" className="mr-3 size-8 text-info" />
                  当前任务: {quest.title}
                </h2>
                <Badge
                  variant={quest.status === 'active' ? 'success' : 'secondary'}
                  className="h-auto self-start px-4 py-1.5 text-base font-black sm:self-auto"
                >
                  {quest.status === 'active' ? '进行中' : '已完成'}
                </Badge>
              </div>

              <p className="mb-6 rounded-card border border-info/20 bg-info-soft/60 p-5 text-lg font-medium leading-relaxed text-fg-2">
                {quest.description || '暂无任务描述'}
              </p>

              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-card border border-info/20 bg-info-soft/50 p-5">
                  <div className="mb-3 flex justify-between text-base font-black text-fg-2">
                    <span>团队进度</span>
                    <span className="text-info-ink">{teamProgressPercent}%</span>
                  </div>
                  <Progress
                    value={teamProgressPercent}
                    label={`团队进度 ${teamProgressPercent}%`}
                    tone="info"
                  />
                  <p className="mt-3 text-sm font-bold text-info-ink">
                    {data?.progress?.team_contribution_score ?? 0} / {quest.target_score}
                  </p>
                </div>

                <div className="rounded-card border border-success/20 bg-success-soft/60 p-5">
                  <p className="mb-2 text-sm font-bold text-success-ink">我的贡献</p>
                  <p className="text-3xl font-black text-success-ink">
                    {data?.progress?.my_contribution_score ?? 0}
                  </p>
                  <p className="mt-3 text-sm text-success-ink">
                    完成团队目标后，每组可获得 {quest.reward_points} 积分
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-card border border-warning/30 bg-warning-soft p-4 text-base font-bold text-warning-ink">
                <ShieldAlert aria-hidden="true" className="size-6 text-warning" />
                截止日期: {quest.end_date || '未设置'}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 16 }) }}
              animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
              className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card md:p-8"
            >
              <h2 className="mb-3 flex items-center text-2xl font-black text-fg-1">
                <CheckSquare aria-hidden="true" className="mr-3 size-7 text-role-ink" />
                组内互评
              </h2>
              <p className="mb-6 text-base font-bold text-fg-3">
                请根据组员在任务中的表现给予客观评价。你的评价会真实写入系统。
              </p>

              <div className="space-y-4">
                {otherMembers.map((member, idx) => (
                  <motion.div
                    initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: -16 }) }}
                    animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
                    transition={{ delay: idx * 0.06 }}
                    key={member.id}
                    className="rounded-panel border-2 border-line-1 bg-surface-3/50 p-5 transition-colors hover:border-role/40 hover:bg-surface-2"
                  >
                    <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-card border-b-2 border-role/20 bg-role-soft text-xl font-black text-role-ink">
                          {member.name[0]}
                        </div>
                        <div>
                          <span className="block text-lg font-black text-fg-1">{member.name}</span>
                          <span className="mt-1 inline-block rounded-pill bg-surface-3 px-3 py-1 text-xs font-bold text-fg-3">
                            👤 组员
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 rounded-card border border-line-1 bg-surface-2 p-2 shadow-card">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <motion.div
                            key={star}
                            whileHover={shouldReduceMotion ? undefined : { scale: 1.15, rotate: 8 }}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`给${member.name}打${star}分`}
                              onClick={() => handleRatingChange(member.id, star)}
                              className="rounded-full hover:bg-transparent"
                            >
                              <Star
                                aria-hidden="true"
                                className={cn(
                                  'size-6',
                                  (reviewForm[member.id] || 0) >= star
                                    ? 'fill-warning text-warning'
                                    : 'fill-surface-3 text-line-strong',
                                )}
                              />
                            </Button>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                    <Textarea
                      value={reviewComments[member.id] || ''}
                      onChange={(e) => handleCommentChange(member.id, e.target.value)}
                      placeholder="写下对该组员的评价或建议（选填）..."
                      rows={2}
                      className="resize-none"
                    />
                  </motion.div>
                ))}
              </div>

              <Button
                onClick={submitPeerReview}
                disabled={reviewMutation.isPending}
                className="mt-6 w-full py-4 text-lg font-black"
              >
                <MessageCircle aria-hidden="true" className="mr-2 size-5" />
                {reviewMutation.isPending ? '提交中...' : '提交互评'}
              </Button>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: 16 }) }}
              animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
              className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card lg:sticky lg:top-4 lg:self-start"
            >
              <h3 className="mb-4 flex items-center text-xl font-black text-fg-1">
                <span className="mr-3 flex size-9 shrink-0 items-center justify-center rounded-card bg-success-soft text-success-ink">
                  <Users aria-hidden="true" className="size-5" />
                </span>
                我的团队
              </h3>
              <ul className="space-y-3">
                {members.map((member, idx) => (
                  <motion.li
                    initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 8 }) }}
                    animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                    transition={{ delay: idx * 0.06 }}
                    key={member.id}
                    className="flex items-center justify-between rounded-card border border-line-1 bg-surface-3/50 p-3 transition-colors hover:border-role/30 hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-card border-b-2 text-lg font-black',
                          member.id === myStudentId
                            ? 'border-role/30 bg-role-soft text-role-ink'
                            : 'border-line-1 bg-surface-2 text-fg-2',
                        )}
                      >
                        {member.name[0]}
                      </div>
                      <span
                        className={cn(
                          'text-base font-black',
                          member.id === myStudentId ? 'text-role-ink' : 'text-fg-1',
                        )}
                      >
                        {member.name}{' '}
                        {member.id === myStudentId && (
                          <span className="ml-1 text-xs font-bold text-fg-3">(我)</span>
                        )}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      )}
    </PageScaffold>
  );
}
