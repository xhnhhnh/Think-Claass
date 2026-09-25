import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { AlertCircle, Flame, Shield, Swords, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { Segmented } from '@/components/ui/segmented';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

import {
  useActiveBoss,
  useAttackBossMutation,
  useChallengeQuestions,
  useChallengeSubmitMutation,
} from '@/features/challenge/hooks/useChallenge';
import type { WorldBossDto } from '@/features/challenge/types';

/**
 * 挑战模式.
 *
 * A `dashboard`: the two tabs are the kit's `Segmented` (the original was two
 * hand-built pills), the result row is a metric row, and the boss's health is the
 * kit's `Progress` rather than a hand-built bar with an inline width - the one
 * dynamic value a page could not express as a class.
 *
 * Everything below the surface is unchanged: the question fetch (5 at a time), the
 * submit mutation, the answer map (including the multi-select toggle), the local
 * boss hp update after an attack and every label. The 重新开始挑战 action that the
 * result view already offers is also registered as a palette command.
 */
export default function StudentChallenge() {
  const user = useStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'questions' | 'boss'>('questions');
  const shouldReduceMotion = useReducedMotion();

  // Questions State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [result, setResult] = useState<any>(null);

  // Boss State
  const [boss, setBoss] = useState<WorldBossDto | null>(null);
  const classId = user?.class_id ?? null;
  const studentId = user?.studentId ?? user?.id ?? null;
  const { data: questions = [], refetch: refetchQuestions } = useChallengeQuestions(studentId, 5);
  const submitMutation = useChallengeSubmitMutation(studentId);
  const { data: queriedBoss } = useActiveBoss(classId);
  const attackMutation = useAttackBossMutation(studentId, classId);

  useEffect(() => {
    setBoss((queriedBoss as WorldBossDto | null) ?? null);
  }, [queriedBoss]);

  const fetchQuestions = async () => {
    try {
      await refetchQuestions();
      setAnswers({});
      setResult(null);
      setCurrentQIndex(0);
    } catch (err) {
      toast.error('获取题目失败');
    }
  };

  const getOptionsArray = (options: any): string[] => {
    if (Array.isArray(options)) return options;
    if (typeof options === 'string') {
      try {
        const parsed = JSON.parse(options);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  };

  const handleAnswer = (questionId: number, answer: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      toast.error('请回答完所有问题');
      return;
    }
    try {
      const data = await submitMutation.mutateAsync(answers);

      if (data.success) {
        setResult(data);
        toast.success(`挑战完成！得分: ${data.score}`);
      }
    } catch (err) {
      toast.error('提交失败');
    }
  };

  const handleAttackBoss = async () => {
    if (!boss || attackMutation.isPending) return;
    try {
      const data = await attackMutation.mutateAsync(boss.id);
      if (data.success) {
        toast.success(`造成了 ${data.damage} 点伤害！`);
        if (data.defeated) {
          toast.success(`击败了Boss！获得了 ${data.rewardPoints} 积分！`);
          setBoss(null);
        } else {
          setBoss(prev => prev ? { ...prev, hp: data.newHp } : null);
        }
      }
    } catch (err) {
      toast.error('攻击失败');
    }
  };

  // The result view's 再来一次 action, offered in the palette too. It reads no page
  // state - `refetchQuestions` and the setters are stable - so the registry's
  // structural key is enough here.
  useRegisterPageCommands([
    {
      id: 'challenge:restart',
      label: '重新开始挑战',
      icon: Swords,
      disabled: questions.length === 0,
      run: () => {
        void fetchQuestions();
      },
    },
  ]);

  const currentQuestion = questions[currentQIndex];
  const bossHpPercent = boss ? Math.max(0, (boss.hp / boss.max_hp) * 100) : 0;

  return (
    <PageScaffold
      variant="dashboard"
      title="挑战模式"
      toolbar={
        <Segmented<'questions' | 'boss'>
          label="挑战模式"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              value: 'questions',
              label: (
                <>
                  <Swords aria-hidden="true" className="size-4" />
                  答题挑战
                </>
              ),
            },
            {
              value: 'boss',
              label: (
                <>
                  <Flame aria-hidden="true" className="size-4" />
                  世界Boss
                </>
              ),
            },
          ]}
        />
      }
    >
      {/* Questions tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'questions' && (
          <motion.div
            key="questions"
            initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: -16 }) }}
            animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
            exit={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: 16 }) }}
            className="rounded-panel border border-line-1 bg-surface-2 p-8 shadow-card md:p-10"
          >
            {result ? (
              <motion.div
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.94 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
                className="space-y-8"
              >
                <div className="text-center">
                  <Trophy aria-hidden="true" className="mx-auto size-24 text-warning" />
                  <h2 className="mt-4 text-3xl font-black text-fg-1">挑战结果</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard icon={Trophy} label="正确" tone="success" value={result.correctCount} />
                  <StatCard icon={AlertCircle} label="错误" tone="destructive" value={result.wrongCount} />
                  <StatCard icon={Swords} label="得分" tone="info" value={result.score} />
                </div>
                <div className="text-center">
                  <Button size="lg" onClick={fetchQuestions}>
                    再来一次
                  </Button>
                </div>
              </motion.div>
            ) : questions.length > 0 && currentQuestion ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQIndex}
                  initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 16 }) }}
                  animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                  exit={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: -16 }) }}
                >
                  <div className="mb-8 flex items-center justify-between gap-3 rounded-card border border-line-1 bg-surface-3 p-4">
                    <h3 className="flex items-center text-xl font-black text-fg-1">
                      <span className="mr-3 flex size-9 items-center justify-center rounded-full bg-role text-role-contrast">
                        {currentQIndex + 1}
                      </span>
                      <span className="mx-2 text-fg-3">/</span>
                      {questions.length}
                    </h3>
                    <span className="rounded-pill border border-info/30 bg-info-soft px-4 py-1.5 text-sm font-bold text-info-ink">
                      {currentQuestion.type === 'SINGLE' ? '单选题' : currentQuestion.type === 'MULTIPLE' ? '多选题' : '判断题'}
                    </span>
                  </div>

                  <div className="mb-8">
                    <h4 className="mb-6 text-2xl font-black leading-tight text-fg-1">
                      {currentQuestion.title}
                    </h4>
                    <div className="space-y-3">
                      {currentQuestion.type === 'JUDGE' ? (
                        ['正确', '错误'].map((opt) => {
                          const isSelected = answers[currentQuestion.id] === opt;
                          return (
                            <Button
                              key={opt}
                              variant="outline"
                              onClick={() => handleAnswer(currentQuestion.id, opt)}
                              className={cn(
                                'h-auto w-full justify-start rounded-card border-2 p-5 text-left text-lg font-bold',
                                isSelected
                                  ? 'border-role bg-role-soft text-role-ink hover:bg-role-soft hover:text-role-ink'
                                  : 'border-line-1 bg-surface-2 text-fg-2 hover:border-role/40 hover:bg-role-soft/40',
                              )}
                            >
                              {opt}
                            </Button>
                          );
                        })
                      ) : (
                        getOptionsArray(currentQuestion.options).map((opt, idx) => {
                          const isMultiple = currentQuestion.type === 'MULTIPLE';
                          const isSelected = isMultiple
                            ? (answers[currentQuestion.id] || []).includes(opt)
                            : answers[currentQuestion.id] === opt;
                          const labels = ['A', 'B', 'C', 'D', 'E', 'F'];

                          return (
                            <Button
                              key={opt}
                              variant="outline"
                              onClick={() => {
                                if (isMultiple) {
                                  const curr = answers[currentQuestion.id] || [];
                                  const next = curr.includes(opt)
                                    ? curr.filter((o: string) => o !== opt)
                                    : [...curr, opt];
                                  handleAnswer(currentQuestion.id, next);
                                } else {
                                  handleAnswer(currentQuestion.id, opt);
                                }
                              }}
                              className={cn(
                                'h-auto w-full justify-start rounded-card border-2 p-5 text-left text-lg font-bold',
                                isSelected
                                  ? 'border-role bg-role-soft text-role-ink hover:bg-role-soft hover:text-role-ink'
                                  : 'border-line-1 bg-surface-2 text-fg-2 hover:border-role/40 hover:bg-role-soft/40',
                              )}
                            >
                              <span
                                className={cn(
                                  'mr-4 flex size-9 shrink-0 items-center justify-center rounded-card',
                                  isSelected
                                    ? 'bg-role text-role-contrast'
                                    : 'bg-surface-3 text-fg-2',
                                )}
                              >
                                {labels[idx]}
                              </span>
                              {opt}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="mt-8 flex justify-between border-t border-line-1 pt-6">
                    <Button
                      variant="outline"
                      disabled={currentQIndex === 0}
                      onClick={() => setCurrentQIndex(i => i - 1)}
                    >
                      上一题
                    </Button>
                    {currentQIndex === questions.length - 1 ? (
                      <Button
                        disabled={submitMutation.isPending}
                        onClick={handleSubmit}
                        className="bg-success text-role-contrast hover:bg-success/90"
                      >
                        {submitMutation.isPending ? '提交中...' : '提交试卷'}
                      </Button>
                    ) : (
                      <Button onClick={() => setCurrentQIndex(i => i + 1)}>下一题</Button>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            ) : (
              <EmptyState icon={AlertCircle} title="暂无题目数据" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boss tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'boss' && (
          <motion.div
            key="boss"
            initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: 16 }) }}
            animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
            exit={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: -16 }) }}
            className="rounded-panel border border-line-1 bg-surface-2 p-8 text-center shadow-card md:p-10"
          >
            {boss ? (
              <div className="space-y-6">
                <motion.div
                  animate={shouldReduceMotion ? undefined : { y: [0, -16, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="mx-auto flex size-40 items-center justify-center rounded-full border-4 border-danger/30 bg-danger-soft"
                >
                  <Flame aria-hidden="true" className="size-20 text-danger" />
                </motion.div>
                <h2 className="text-3xl font-black text-fg-1">{boss.name}</h2>
                <p className="mx-auto max-w-lg text-lg font-medium text-fg-2">{boss.description}</p>

                <div className="mx-auto mt-6 w-full max-w-2xl space-y-2">
                  <Progress
                    value={bossHpPercent}
                    label={`首领血量 ${boss.hp} / ${boss.max_hp}`}
                    tone="destructive"
                  />
                  <div className="text-lg font-black text-fg-1">
                    HP: {boss.hp} / {boss.max_hp}
                  </div>
                </div>

                <Button
                  size="lg"
                  onClick={handleAttackBoss}
                  disabled={attackMutation.isPending || boss.hp <= 0}
                  className="mt-6 bg-danger text-role-contrast hover:bg-danger/90"
                >
                  {attackMutation.isPending ? '攻击中...' : boss.hp <= 0 ? 'Boss已被击败' : '发起攻击！'}
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={Shield}
                title="当前没有出现世界Boss"
                description="请等待老师开启"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageScaffold>
  );
}
