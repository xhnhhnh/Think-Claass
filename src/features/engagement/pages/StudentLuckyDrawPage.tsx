import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Gift, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { useQuery } from '@tanstack/react-query';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { teacherApi } from '@/features/classroom/api/classesApi';
import { useLuckyDrawConfig, useLuckyDrawMutation } from '@/hooks/queries/useLuckyDraw';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
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
  const { data: configData, isLoading: loading, refetch } = useLuckyDrawConfig(teacherId);
  const drawMutation = useLuckyDrawMutation(studentId);
  const configs = ((configData?.configs ?? []) as PrizeConfig[]);
  const costPoints = configData?.cost_points ?? 10;
  const availablePoints = currentStudent?.available_points ?? 0;
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<{ prize_name: string; message: string } | null>(null);
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

  const handleDraw = async (index: number) => {
    if (drawing || flippedIndex !== null) return;
    if (availablePoints < costPoints) {
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
          await refetch();
        }
        setDrawing(false);
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
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
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" label="正在加载抽奖配置" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-5xl space-y-8"
    >
      {/* Header */}
      <motion.div
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="relative overflow-hidden rounded-panel border-b-8 border-primary/30 bg-paper p-10 shadow-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary to-accent-foreground opacity-10" />
        {/* Two slow drifting washes: `animate-blob` was defined nowhere, so these
            replace classes that compiled to nothing with animation that plays. */}
        <motion.div
          aria-hidden="true"
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/30 mix-blend-multiply blur-3xl"
        />
        <motion.div
          aria-hidden="true"
          animate={{ scale: [1.18, 1, 1.18] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-accent-foreground/20 mix-blend-multiply blur-3xl"
        />

        <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
          <PageHeader
            title="幸运翻牌"
            description="试试你的手气，看看能翻出什么大奖！"
            icon={Gift}
            className="flex-1"
          />
          <StatCard
            label="我的可用积分"
            icon={Star}
            tone="warning"
            value={
              <span className="text-4xl font-black text-primary">
                {availablePoints} <span className="text-xl font-bold">币</span>
              </span>
            }
            className="shrink-0 border-b-8 border-r-4 border-l-4 border-t-4 border-primary/30 shadow-raised"
          />
        </div>
      </motion.div>

      {configs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <EmptyState
            icon={Gift}
            title="暂未配置抽奖"
            description="老师还没有配置抽奖奖品哦"
            className="min-h-60 border-4 border-dashed bg-paper"
          />
        </motion.div>
      ) : (
        <div className="rounded-panel border-8 border-primary/20 bg-paper p-10 shadow-raised">
          <div className="mb-10 text-center">
            <span className="inline-flex items-center rounded-card border-b-4 border-primary/30 bg-primary/5 px-6 py-3 text-xl font-black text-primary shadow-card">
              每次抽奖消耗 {costPoints} 积分
            </span>
          </div>

          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-6 md:gap-8">
            {Array.from({ length: 9 }).map((_, index) => (
              <motion.div
                key={index}
                whileHover={flippedIndex === null ? { scale: 1.05, y: -5 } : {}}
                whileTap={flippedIndex === null ? { scale: 0.95 } : {}}
                onClick={() => handleDraw(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleDraw(index);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-disabled={flippedIndex !== null && flippedIndex !== index}
                aria-label={`翻开第 ${index + 1} 张牌`}
                className={`relative aspect-[3/4] w-full cursor-pointer [perspective:1000px] [transform-style:preserve-3d] transition-transform duration-700 ${
                  flippedIndex === index ? '[transform:rotateY(180deg)]' : ''
                } ${flippedIndex !== null && flippedIndex !== index ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {/* Front of card */}
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-panel border-4 border-b-8 border-accent-foreground bg-gradient-to-br from-accent-foreground to-info shadow-raised [backface-visibility:hidden]">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
                  <Sparkles className="size-16 animate-pulse text-paper/80 drop-shadow-md" />
                </div>
                
                {/* Back of card */}
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-panel border-8 border-warning bg-paper p-6 text-center shadow-raised [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  {flippedIndex === index && result ? (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, type: "spring" }}
                    >
                      <Gift className="mx-auto mb-4 size-16 text-warning drop-shadow-md" />
                      <p className="text-2xl font-black leading-tight text-ink-1">
                        {result.prize_name}
                      </p>
                    </motion.div>
                  ) : flippedIndex === index ? (
                    /* Only the flipped card needs the pending state: the other eight backs
                       are turned away, and nine live `role="status"` regions would be noise. */
                    <Spinner size="lg" label="抽奖中" className="text-primary" />
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-16 text-center"
              >
                <div className="inline-block rounded-panel border-8 border-warning/40 bg-warning/10 p-8 shadow-raised">
                  <h3 className="mb-4 text-4xl font-black text-warning drop-shadow-sm">翻牌结果</h3>
                  <p className="mb-8 text-2xl font-bold text-ink-1">{result.message}</p>
                  <Button
                    onClick={resetDraw}
                    className="h-auto rounded-panel border-b-8 border-accent-foreground bg-gradient-to-r from-primary to-accent-foreground px-12 py-4 text-2xl font-black hover:-translate-y-1"
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
  );
}
