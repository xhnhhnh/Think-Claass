import { useStore } from '@/store/useStore';
import { Swords, Flame } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { useBattleStats, useTeacherBattles } from '@/features/battles/hooks/useBattles';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';

/**
 * 跨班大乱斗 (学生观战面板).
 *
 * A live stage: the red/blue split behind the two class names, the giant VS and the
 * tug-of-war bar a spring animates from the two scores all stay, matching the teacher's
 * version of this panel. The canvas is the inverted surface (`fg-1`) with `fg-inverse`
 * text, so the stage stays dark-on-light in the light theme and flips with dark mode
 * instead of pinning the old `secondary-foreground` / `primary-foreground` pair.
 *
 * The score pop animates scale only, because the tokens are `hsl(var(--x))` and a var()
 * cannot be interpolated; under `prefers-reduced-motion` the pop and the bar springs drop
 * to an instant state and the opacity half of every entrance stays.
 */
export default function StudentBrawl() {
  const user = useStore((state) => state.user);
  const classId = user?.class_id ?? null;
  const { data: battles = [], isLoading: loading } = useTeacherBattles(classId, 5000);
  const activeBattle = battles.find((battle) => battle.status === 'active') ?? null;
  const { data: stats } = useBattleStats(activeBattle?.id ?? null, !!activeBattle, 5000);
  const shouldReduceMotion = useReducedMotion();

  if (loading) {
    return (
      <PageScaffold variant="immersive" className="flex min-h-dvh items-center justify-center p-12">
        <div className="flex items-center justify-center gap-2 text-fg-3">
          <Spinner size="lg" label="正在加载战况" />
          加载中...
        </div>
      </PageScaffold>
    );
  }

  if (!activeBattle || !stats) {
    return (
      <PageScaffold variant="immersive" className="min-h-dvh p-4 pt-16 sm:p-8">
        <EmptyState
          icon={Swords}
          title="风平浪静"
          description={<>目前没有正在进行的跨班大乱斗。<br />请随时准备好，战争随时可能爆发！</>}
          className="mx-auto mt-12 max-w-4xl bg-surface-2"
        />
      </PageScaffold>
    );
  }

  const isInitiator = activeBattle.initiator_class_id === user.class_id;
  const myScore = isInitiator ? stats.initiatorScore : stats.targetScore;
  const enemyScore = isInitiator ? stats.targetScore : stats.initiatorScore;
  const enemyName = isInitiator ? activeBattle.target_class_name : activeBattle.initiator_class_name;

  const totalScore = myScore + enemyScore;
  const myPercentage = totalScore === 0 ? 50 : (myScore / totalScore) * 100;
  const enemyPercentage = totalScore === 0 ? 50 : (enemyScore / totalScore) * 100;

  const springTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, bounce: 0.1 };

  return (
    <PageScaffold
      variant="immersive"
      className="flex min-h-dvh items-center justify-center p-4 pt-16 sm:p-8"
    >
      <div className="relative mx-auto flex min-h-[600px] w-full max-w-5xl flex-col justify-center overflow-hidden rounded-panel p-4 sm:p-8">
        {/* Immersive Background */}
        <div className="absolute inset-0 overflow-hidden bg-fg-1">
          <div className="absolute inset-0 flex opacity-30">
            <motion.div
              animate={{ width: `${myPercentage}%` }}
              transition={springTransition}
              className="h-full bg-gradient-to-r from-danger to-danger/60"
            />
            <motion.div
              animate={{ width: `${enemyPercentage}%` }}
              transition={springTransition}
              className="h-full bg-gradient-to-l from-info to-info/60"
            />
          </div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center space-y-16">

          <motion.div
            initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.8 }) }}
            animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
            className="text-center"
          >
            <div className="mb-8 inline-flex items-center rounded-pill border border-danger/30 bg-fg-1/50 px-4 py-2 font-bold text-danger shadow-glow-role backdrop-blur-md">
              <Flame className="mr-2 size-5 animate-pulse" />
              跨班大乱斗正在进行中
            </div>
          </motion.div>

          {/* Combatants */}
          <div className="flex w-full items-center justify-between px-4 sm:px-12">

            {/* My Class (Left) */}
            <motion.div
              initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: -50 }) }}
              animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
              className="w-5/12 text-center"
            >
              <div className="mb-2 text-lg font-bold text-danger drop-shadow-md">本班阵营</div>
              <div className="truncate text-3xl font-black text-fg-inverse drop-shadow-lg sm:text-4xl">
                {isInitiator ? activeBattle.initiator_class_name : activeBattle.target_class_name}
              </div>
              <motion.div
                key={myScore}
                initial={shouldReduceMotion ? undefined : { scale: 1.5 }}
                animate={shouldReduceMotion ? undefined : { scale: 1 }}
                className="mt-6 text-6xl font-black text-danger drop-shadow-lg sm:text-8xl"
              >
                {myScore}
              </motion.div>
            </motion.div>

            {/* VS Badge */}
            <motion.div
              animate={shouldReduceMotion ? undefined : { scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="z-20 flex w-2/12 justify-center"
            >
              <div className="flex size-20 -rotate-12 transform items-center justify-center rounded-full border-4 border-surface-2 bg-gradient-to-br from-warning to-warning/70 text-3xl font-black italic text-fg-inverse shadow-glow-role sm:size-28 sm:text-5xl">
                VS
              </div>
            </motion.div>

            {/* Enemy Class (Right) */}
            <motion.div
              initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { x: 50 }) }}
              animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { x: 0 }) }}
              className="w-5/12 text-center"
            >
              <div className="mb-2 text-lg font-bold text-info drop-shadow-md">敌方阵营</div>
              <div className="truncate text-3xl font-black text-fg-inverse drop-shadow-lg sm:text-4xl">
                {enemyName}
              </div>
              <motion.div
                key={enemyScore}
                initial={shouldReduceMotion ? undefined : { scale: 1.5 }}
                animate={shouldReduceMotion ? undefined : { scale: 1 }}
                className="mt-6 text-6xl font-black text-info drop-shadow-lg sm:text-8xl"
              >
                {enemyScore}
              </motion.div>
            </motion.div>

          </div>

          {/* Central Progress Bar */}
          <div className="relative mt-12 w-full max-w-3xl px-8">
            <div className="relative flex h-10 w-full overflow-hidden rounded-pill border-2 border-fg-inverse/10 bg-fg-1/80 shadow-raised backdrop-blur-md sm:h-14">
              <motion.div
                className="relative h-full bg-gradient-to-r from-danger via-danger/80 to-danger/60"
                initial={{ width: '50%' }}
                animate={{ width: `${myPercentage}%` }}
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.3 }}
              >
                {myPercentage > 50 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black italic text-fg-inverse/80">
                    压制!
                  </div>
                )}
              </motion.div>

              <motion.div
                className="relative h-full bg-gradient-to-l from-info via-info/80 to-info/60"
                initial={{ width: '50%' }}
                animate={{ width: `${enemyPercentage}%` }}
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.3 }}
              >
                 {enemyPercentage > 50 && (
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 font-black italic text-fg-inverse/80">
                    反击!
                  </div>
                )}
              </motion.div>

              {/* Middle Marker */}
              <div className="absolute bottom-0 left-1/2 top-0 z-10 w-1 -translate-x-1/2 bg-fg-inverse/50" />
            </div>

            <p className="mt-6 text-center text-sm font-medium uppercase tracking-widest text-fg-inverse/70">
              完成课堂任务、互相点赞、或击败BOSS均可为本班增加战力
            </p>
          </div>

        </div>
      </div>
    </PageScaffold>
  );
}
