import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Skull, Heart, Swords, Sparkles, Tent, Zap, ArrowRight, ArrowDownToLine, Box, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useDungeonActionMutation, useDungeonRun } from '@/features/dungeon/hooks/useDungeon';
import type { FloorChoice } from '@/features/dungeon/api/dungeonApi';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * 深渊无尽塔.
 *
 * The dungeon is a stage, not a page: the deep canvas, the floor number burned into it,
 * the red vignette and the spring that drops each door in all stay. What the migration
 * changed is where the surfaces come from - the near-black ramp the page was written in
 * is the `secondary-foreground` canvas with `primary-foreground` wells over it, so the
 * stage follows the student theme instead of a fixed grey.
 *
 * The two blocking `window.confirm` calls are `ConfirmDialog`s now, driven by state: the
 * lethal door is held in `pendingChoice` until the student confirms it, and abandoning
 * the run opens its own dialog. Both kept their sentences verbatim as the description.
 */
export default function StudentDungeon() {
  const user = useStore(state => state.user);
  const studentId = user?.studentId ?? user?.id ?? null;
  const { data, isLoading: loading } = useDungeonRun(studentId);
  const actionMutation = useDungeonActionMutation(studentId);
  const run = data?.run ?? null;
  const choices = data?.choices ?? [];
  const bestFloor = data?.best_floor ?? 0;
  const processing = actionMutation.isPending;

  /** The door waiting on the "this will kill you" confirmation. */
  const [pendingChoice, setPendingChoice] = useState<FloorChoice | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const startRun = async () => {
    if (!user) return;
    try {
      await actionMutation.mutateAsync({ action: 'start' });
      toast.success('深入地下城...');
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const submitChoice = async (choice: FloorChoice) => {
    try {
      const response = await actionMutation.mutateAsync({ action: 'choice', choice });
      const result = (response.data ?? response) as { status?: string };

      if (result.status === 'died') {
        toast.error(`你在第 ${run?.current_floor} 层倒下了...`);
      } else {
        toast.success('成功推进至下一层！');
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const makeChoice = (choice: FloorChoice) => {
    if (!user || !run) return;

    if (run.current_hp - choice.hpCost <= 0) {
      setPendingChoice(choice);
      return;
    }

    void submitChoice(choice);
  };

  const abandonRun = async () => {
    if (!user) return;
    try {
      await actionMutation.mutateAsync({ action: 'abandon' });
      toast.success('已逃离地下城');
    } catch (err) {
      toast.error('网络错误');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-ink-3">
        <Spinner size="lg" label="正在加载地下城" />
        加载中...
      </div>
    );
  }

  const getChoiceIcon = (type: string) => {
    switch (type) {
      case 'combat': return <Swords className="size-8 text-destructive" />;
      case 'event': return <Sparkles className="size-8 text-accent-foreground" />;
      case 'treasure': return <Box className="size-8 text-warning" />;
      case 'rest': return <Tent className="size-8 text-success" />;
      default: return <HelpCircle className="size-8 text-primary-foreground/60" />;
    }
  };

  // ----------------------------------------
  // LOBBY VIEW (No active run)
  // ----------------------------------------
  if (!run) {
    return (
      <div className="relative mx-auto flex min-h-[600px] max-w-4xl flex-col justify-center overflow-hidden rounded-panel p-4 shadow-floating sm:p-8">
        <div className="absolute inset-0 z-0 overflow-hidden bg-secondary-foreground">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 mix-blend-overlay" />
          <div className="absolute bottom-0 h-1/2 w-full bg-gradient-to-t from-destructive/50 to-transparent" />
        </div>

        <div className="relative z-10 space-y-8 text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto flex size-32 items-center justify-center rounded-full border-4 border-destructive/30 bg-destructive/20 shadow-glow-primary"
          >
            <Skull className="size-16 animate-pulse text-destructive" />
          </motion.div>
          
          <div>
            <h1 className="mb-4 bg-gradient-to-b from-primary-foreground to-primary-foreground/40 bg-clip-text text-4xl font-black tracking-tighter text-transparent sm:text-6xl">
              深渊无尽塔
            </h1>
            <p className="mx-auto max-w-lg text-lg text-primary-foreground/70">
              每次进入都是随机生成的房间与挑战。合理规划你的生命值，尽可能深入，获取遗物与巨额积分奖励。
            </p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="rounded-card border border-primary-foreground/10 bg-foreground/40 px-6 py-3 backdrop-blur-md">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-primary-foreground/70">历史最高层数</span>
              <span className="text-3xl font-black text-warning drop-shadow-lg">
                {bestFloor} <span className="text-lg text-warning/50">F</span>
              </span>
            </div>

            <Button
              onClick={startRun}
              disabled={processing}
              className="group relative h-auto overflow-hidden rounded-card border-b-4 border-foreground/20 bg-destructive px-12 py-4 text-xl font-black text-destructive-foreground shadow-glow-primary transition-all hover:scale-105 hover:bg-destructive/90"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              {processing ? '连接深渊中...' : '踏入深渊'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------
  // ACTIVE RUN VIEW
  // ----------------------------------------
  const hpPercentage = (run.current_hp / run.max_hp) * 100;
  // The old bar swapped three hard-coded greens/ambers/reds by hand; the threshold is
  // the same, it just picks a tone the kit already has.
  const hpTone = hpPercentage > 50 ? 'success' : hpPercentage > 20 ? 'warning' : 'destructive';

  return (
    <div className="relative mx-auto flex min-h-[800px] max-w-6xl flex-col overflow-hidden rounded-panel border border-destructive/30 p-4 shadow-floating sm:p-8">
      {/* Immersive Dungeon Background */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-secondary-foreground">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-40 mix-blend-overlay" />
        
        {/* Floor Indicator Depth Effect */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-[30vw] font-black text-primary-foreground/5">
          {run.current_floor}
        </div>
        
        {/* Red Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--destructive)/0.3))]" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        {/* Top HUD */}
        <div className="mb-12 flex flex-col items-start justify-between gap-4 rounded-panel border border-primary-foreground/10 bg-foreground/50 p-6 backdrop-blur-xl sm:flex-row sm:items-center">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <span className="text-4xl font-black text-destructive drop-shadow-lg">{run.current_floor}</span>
              <span className="mt-1 block text-xs font-bold uppercase tracking-widest text-primary-foreground/60">当前层数</span>
            </div>
            
            <div className="h-12 w-px bg-primary-foreground/10" />
            
            {/* HP Bar */}
            <div className="w-48 sm:w-64">
              <div className="mb-2 flex justify-between text-sm font-bold">
                <span className="flex items-center text-destructive"><Heart className="mr-1 size-4" /> 生命值</span>
                <span className="text-primary-foreground">{run.current_hp} / {run.max_hp}</span>
              </div>
              <Progress value={hpPercentage} label={`生命值 ${run.current_hp} / ${run.max_hp}`} tone={hpTone} />
            </div>
          </div>

          <div className="flex w-full items-center gap-4 sm:w-auto">
            {/* Buffs Area */}
            <div className="flex flex-wrap gap-2">
              {run.active_buffs.map((buff, i) => (
                <div key={i} className="group relative flex size-10 cursor-help items-center justify-center rounded-card border border-accent/40 bg-accent/20">
                  <Zap className="size-5 text-accent" />
                  <div className="pointer-events-none absolute top-full z-50 mt-2 w-max rounded bg-foreground px-3 py-1 text-xs text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {buff}
                  </div>
                </div>
              ))}
              {run.active_buffs.length === 0 && (
                <span className="text-sm font-medium text-primary-foreground/50">暂无遗物</span>
              )}
            </div>

            <Button 
              variant="ghost"
              size="icon-lg"
              aria-label="逃离地下城 (放弃进度)"
              title="逃离地下城 (放弃进度)"
              onClick={() => setConfirmAbandon(true)}
              className="ml-auto text-primary-foreground/60 hover:bg-destructive/10 hover:text-destructive"
            >
              <ArrowDownToLine />
            </Button>
          </div>
        </div>

        {/* Room Choices */}
        <div className="flex flex-1 flex-col items-center justify-center pb-12">
          <h2 className="mb-12 flex items-center text-2xl font-bold text-primary-foreground">
            选择下一扇门... <ArrowRight className="ml-3 size-6 animate-pulse text-destructive" />
          </h2>

          <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {choices.map((choice, index) => (
                <motion.div
                  key={`${run.current_floor}-${choice.id}`}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -10 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant="outline"
                    onClick={() => makeChoice(choice)}
                    disabled={processing}
                    className="group relative h-full w-full flex-col items-center gap-0 whitespace-normal rounded-panel border border-primary-foreground/10 bg-primary-foreground/5 p-8 text-left shadow-raised backdrop-blur-md transition-all hover:border-destructive/50 hover:bg-primary-foreground/10"
                  >
                    <span className="pointer-events-none absolute inset-0 rounded-panel bg-gradient-to-b from-transparent to-foreground/60" />
                    
                    <div className="relative z-10 flex w-full flex-col items-center">
                      <div className="mb-6 flex size-20 items-center justify-center rounded-card border border-primary-foreground/10 bg-primary-foreground/10 shadow-inner transition-transform group-hover:scale-110">
                        {getChoiceIcon(choice.type)}
                      </div>
                      
                      <h3 className="mb-2 text-xl font-black text-primary-foreground">{choice.title}</h3>
                      <p className="mb-6 h-10 text-center text-sm text-primary-foreground/70">{choice.description}</p>

                      <div className="w-full space-y-2 border-t border-primary-foreground/10 pt-6">
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span className="text-primary-foreground/60">代价</span>
                          <span className="flex items-center text-destructive">
                            <Heart className="mr-1 size-4" /> -{choice.hpCost} HP
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span className="text-primary-foreground/60">奖励预测</span>
                          <span className={cn(
                            'flex items-center',
                            choice.rewardType === 'points' ? 'text-warning' :
                            choice.rewardType === 'buff' ? 'text-accent' : 'text-success',
                          )}>
                            {choice.rewardType === 'points' && `+${choice.rewardValue} 积分`}
                            {choice.rewardType === 'buff' && `未知遗物`}
                            {choice.rewardType === 'heal' && `+${choice.rewardValue} HP`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>

      <ConfirmDialog
        open={Boolean(pendingChoice)}
        onOpenChange={(open) => !open && setPendingChoice(null)}
        title="生命值将归零"
        description="此选择会导致生命值归零，确定要赴死吗？"
        confirmLabel="确定"
        pendingLabel="处理中..."
        destructive
        isPending={processing}
        onConfirm={async () => {
          const choice = pendingChoice;
          setPendingChoice(null);
          if (choice) await submitChoice(choice);
        }}
      />

      <ConfirmDialog
        open={confirmAbandon}
        onOpenChange={setConfirmAbandon}
        title="放弃本次探索"
        description="确定要放弃本次探索吗？(生命值将归零，进度重置)"
        confirmLabel="确定"
        pendingLabel="处理中..."
        destructive
        isPending={processing}
        onConfirm={async () => {
          setConfirmAbandon(false);
          await abandonRun();
        }}
      />
    </div>
  );
}
