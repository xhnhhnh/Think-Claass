import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Gift, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { useQuery } from '@tanstack/react-query';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { teacherApi } from '@/features/classroom/api/classesApi';
import { useLuckyDrawConfig, useLuckyDrawMutation } from '@/hooks/queries/useLuckyDraw';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';

interface PrizeConfig {
  prize_name: string;
  prize_type: 'POINTS' | 'ITEM' | 'NOTHING';
  prize_value: number;
}

export default function StudentLuckyDraw() {
  const user = useStore((state) => state.user);
  const studentId = user?.studentId ?? null;
  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const data = (await studentsApi.getStudents()) as any;
      return data.students ?? [];
    },
  });
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const data = (await teacherApi.getClasses()) as any;
      return data.classes ?? [];
    },
  });
  const currentStudent = (students as any[]).find((s) => s.id === studentId);
  const teacherId = (classes as any[]).find((c) => c.id === currentStudent?.class_id)?.teacher_id ?? 1;
  const { data: configData, isLoading: loading, isError: configError, refetch: refetchConfig } = useLuckyDrawConfig(teacherId);
  const drawMutation = useLuckyDrawMutation(studentId);
  const configs = ((configData?.configs ?? []) as PrizeConfig[]);
  const costPoints = configData?.cost_points ?? 10;

  /**
   * The balance is the shell's live query, not the student list row.
   *
   * It comes from `['students']`, which nothing refreshes after a draw, so the card kept showing
   * the pre-draw number and let the student draw again only for the server to refuse 积分不足. A
   * failed read also collapsed to 0, which read as "you are broke". The global mutation hook
   * invalidates `['motivation-summary']`, so this one updates by itself after each draw.
   */
  const {
    data: summary,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ['motivation-summary', studentId],
    queryFn: () => studentsApi.getSummary(studentId!),
    enabled: !!studentId,
  });
  const availablePoints = summary?.summary.availableCredits;
  const balanceSettled = !balanceLoading && !balanceError && availablePoints !== undefined;

  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<{ prize_name: string; message: string } | null>(null);
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const handleDraw = async (index: number) => {
    if (drawing || flippedIndex !== null) return;
    if (!balanceSettled) {
      // Never guess the balance: treating "not read yet" (or "read failed") as 0 told a pupil with
      // points that they had none.
      if (balanceError) toast.error('积分余额没有加载出来，请点「重新加载」再试');
      return;
    }
    if ((availablePoints ?? 0) < costPoints) {
      toast.error('积分不足');
      return;
    }

    setDrawing(true);
    setResult(null);
    setFlippedIndex(index);

    try {
      const data = await drawMutation.mutateAsync();

      // Delay to show animation
      setTimeout(async () => {
        if (data.success) {
          setResult({ prize_name: data.prize.prize_name, message: data.message });
          toast.success(data.message);
          await refetchConfig();
        }
        setDrawing(false);
      }, 1000);
    } catch {
      // The api layer toasted the refusal (积分不足 / 功能未开启…); a second generic
      // network-failure toast was wrong.
      setFlippedIndex(null);
      setDrawing(false);
    }
  };

  const resetDraw = () => {
    setResult(null);
    setFlippedIndex(null);
  };

  if (loading) {
    return (
      <PageScaffold variant="immersive" className="flex min-h-dvh items-center justify-center py-20">
        <Spinner size="lg" label="正在加载抽奖配置" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold variant="immersive" className="min-h-dvh px-4 pb-12 pt-16 sm:px-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-5xl space-y-8"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: -20 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
          className="relative overflow-hidden rounded-panel border-b-8 border-role/30 bg-surface-2 p-10 shadow-card"
        >
          <div className="pointer-events-none absolute inset-0 bg-role opacity-10" />
          {/* Two slow drifting washes: `animate-blob` was defined nowhere, so these
              replace classes that compiled to nothing with animation that plays. */}
          <motion.div
            aria-hidden="true"
            animate={shouldReduceMotion ? undefined : { scale: [1, 1.18, 1] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-role/30 mix-blend-multiply blur-3xl"
          />
          <motion.div
            aria-hidden="true"
            animate={shouldReduceMotion ? undefined : { scale: [1.18, 1, 1.18] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-role-ink/20 mix-blend-multiply blur-3xl"
          />

          <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
            {/* The immersive shell renders no context bar, so the page keeps its own heading. */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-role-soft text-role-ink">
                <Gift aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight text-fg-1">幸运翻牌</h2>
                <p className="mt-1 text-sm text-fg-3">试试你的手气，看看能翻出什么大奖！</p>
              </div>
            </div>
            <StatCard
              label="我的可用积分"
              icon={Star}
              tone="warning"
              value={
                <span className="text-3xl font-bold text-role">
                  {balanceError ? '—' : balanceLoading ? '…' : (availablePoints ?? 0)}{' '}
                  <span className="text-xl font-bold">币</span>
                </span>
              }
              className="shrink-0 border-b-8 border-l-4 border-r-4 border-t-4 border-role/30 shadow-raised"
            />
          </div>
        </motion.div>

        {balanceError ? (
          <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
            <p className="font-semibold text-danger">积分余额没有加载出来</p>
            <p className="mt-1 text-sm text-fg-3">
              这不代表你的积分是 0——余额读出来之前，翻牌不会按「积分不足」处理。请重试，或稍后再看。
            </p>
            <Button variant="outline" className="mt-3" onClick={() => void refetchBalance()}>
              重新加载
            </Button>
          </div>
        ) : null}

        {configError ? (
          // 「暂未配置抽奖」 after a failed request tells a pupil their teacher never set the prizes
          // up; the retry is the only useful thing this page can offer at that moment.
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
              <p className="font-semibold text-danger">抽奖配置没有加载出来</p>
              <p className="mt-1 text-sm text-fg-3">这不代表老师没有配置奖品，请重试。</p>
              <Button variant="outline" className="mt-3" onClick={() => void refetchConfig()}>
                重新加载
              </Button>
            </div>
          </motion.div>
        ) : configs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <EmptyState
              icon={Gift}
              title="暂未配置抽奖"
              description="老师还没有配置抽奖奖品哦"
              className="min-h-60 border-4 border-dashed bg-surface-2"
            />
          </motion.div>
        ) : (
          <div className="rounded-panel border-8 border-role/20 bg-surface-2 p-10 shadow-raised">
            <div className="mb-10 text-center">
              <span className="inline-flex items-center rounded-card border-b-4 border-role/30 bg-role/5 px-6 py-3 text-xl font-bold text-role shadow-card">
                每次抽奖消耗 {costPoints} 积分
              </span>
            </div>

            <div className="mx-auto grid max-w-3xl grid-cols-3 gap-6 md:gap-8">
              {Array.from({ length: 9 }).map((_, index) => (
                <motion.div
                  key={index}
                  whileHover={flippedIndex === null && !shouldReduceMotion ? { scale: 1.05, y: -5 } : {}}
                  whileTap={flippedIndex === null && !shouldReduceMotion ? { scale: 0.95 } : {}}
                  onClick={() => handleDraw(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleDraw(index);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-disabled={!balanceSettled || (flippedIndex !== null && flippedIndex !== index)}
                  aria-label={`翻开第 ${index + 1} 张牌`}
                  className={`relative aspect-[3/4] w-full [perspective:1000px] [transform-style:preserve-3d] transition-transform duration-700 ${
                    balanceSettled ? 'cursor-pointer' : 'cursor-wait opacity-70'
                  } ${
                    flippedIndex === index ? '[transform:rotateY(180deg)]' : ''
                  } ${flippedIndex !== null && flippedIndex !== index ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {/* Front of card */}
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-panel border-4 border-b-8 border-role-ink bg-role-ink shadow-raised [backface-visibility:hidden]">
                    <div className="absolute inset-0 pattern-grid opacity-20 mix-blend-overlay"></div>
                    <Sparkles className="size-16 animate-pulse text-fg-inverse/80 drop-shadow-md" />
                  </div>

                  {/* Back of card */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-panel border-8 border-warning bg-surface-2 p-6 text-center shadow-raised [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    {flippedIndex === index && result ? (
                      <motion.div
                        initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.5 }) }}
                        animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
                        transition={{ delay: 0.3, type: "spring" }}
                      >
                        <Gift className="mx-auto mb-4 size-16 text-warning drop-shadow-md" />
                        <p className="text-2xl font-bold leading-tight text-fg-1">
                          {result.prize_name}
                        </p>
                      </motion.div>
                    ) : flippedIndex === index ? (
                      /* Only the flipped card needs the pending state: the other eight backs
                         are turned away, and nine live `role="status"` regions would be noise. */
                      <Spinner size="lg" label="抽奖中" className="text-role" />
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </div>

            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 20 }) }}
                  animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                  exit={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: -20 }) }}
                  className="mt-16 text-center"
                >
                  <div className="inline-block rounded-panel border-8 border-warning/40 bg-warning/10 p-8 shadow-raised">
                    <h3 className="mb-4 text-3xl font-bold text-warning drop-shadow-sm">翻牌结果</h3>
                    <p className="mb-8 text-2xl font-bold text-fg-1">{result.message}</p>
                    <Button
                      onClick={resetDraw}
                      className="h-auto rounded-panel border-b-8 border-role-ink bg-role px-12 py-4 text-2xl font-bold hover:-translate-y-1"
                    >
                      再翻一次
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </PageScaffold>
  );
}
