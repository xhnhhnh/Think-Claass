import { useStore } from '@/store/useStore';
import { Swords, Flame } from 'lucide-react';
import { motion } from 'framer-motion';

import { useBattleStats, useTeacherBattles } from '@/features/battles/hooks/useBattles';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

/**
 * 跨班大乱斗 (学生观战面板).
 *
 * A live stage: the red/blue split behind the two class names, the giant VS and the
 * tug-of-war bar a spring animates from the two scores all stay, matching the teacher's
 * version of this panel. The two team colours are the `destructive` and `info` tokens,
 * and the dark canvas is `secondary-foreground` with `primary-foreground` overlays.
 *
 * The score pop used to animate a hex colour from white to the team red inside the
 * `motion` props; the colour now lives on the class and only the scale is animated,
 * because the tokens are `hsl(var(--x))` and a var() cannot be interpolated.
 */
export default function StudentBrawl() {
  const user = useStore((state) => state.user);
  const classId = user?.class_id ?? null;
  const { data: battles = [], isLoading: loading } = useTeacherBattles(classId, 5000);
  const activeBattle = battles.find((battle) => battle.status === 'active') ?? null;
  const { data: stats } = useBattleStats(activeBattle?.id ?? null, !!activeBattle, 5000);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-ink-3">
        <Spinner size="lg" label="正在加载战况" />
        加载中...
      </div>
    );
  }

  if (!activeBattle || !stats) {
    return (
      <EmptyState
        icon={Swords}
        title="风平浪静"
        description={<>目前没有正在进行的跨班大乱斗。<br />请随时准备好，战争随时可能爆发！</>}
        className="mx-auto mt-12 max-w-4xl bg-paper"
      />
    );
  }

  const isInitiator = activeBattle.initiator_class_id === user.class_id;
  const myScore = isInitiator ? stats.initiatorScore : stats.targetScore;
  const enemyScore = isInitiator ? stats.targetScore : stats.initiatorScore;
  const enemyName = isInitiator ? activeBattle.target_class_name : activeBattle.initiator_class_name;
  
  const totalScore = myScore + enemyScore;
  const myPercentage = totalScore === 0 ? 50 : (myScore / totalScore) * 100;
  const enemyPercentage = totalScore === 0 ? 50 : (enemyScore / totalScore) * 100;

  return (
    <div className="relative mx-auto flex min-h-[600px] max-w-5xl flex-col justify-center overflow-hidden rounded-panel p-4 sm:p-8">
      {/* Immersive Background */}
      <div className="absolute inset-0 overflow-hidden bg-secondary-foreground">
        <div className="absolute inset-0 flex opacity-30">
          <motion.div 
            animate={{ width: `${myPercentage}%` }} 
            transition={{ type: "spring", bounce: 0.1 }}
            className="h-full bg-gradient-to-r from-destructive to-destructive/60" 
          />
          <motion.div 
            animate={{ width: `${enemyPercentage}%` }} 
            transition={{ type: "spring", bounce: 0.1 }}
            className="h-full bg-gradient-to-l from-info to-info/60" 
          />
        </div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center space-y-16">
        
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="mb-8 inline-flex items-center rounded-pill border border-destructive/30 bg-foreground/50 px-4 py-2 font-bold text-destructive shadow-glow-primary backdrop-blur-md">
            <Flame className="mr-2 size-5 animate-pulse" />
            跨班大乱斗正在进行中
          </div>
        </motion.div>

        {/* Combatants */}
        <div className="flex w-full items-center justify-between px-4 sm:px-12">
          
          {/* My Class (Left) */}
          <motion.div 
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-5/12 text-center"
          >
            <div className="mb-2 text-lg font-bold text-destructive drop-shadow-md">本班阵营</div>
            <div className="truncate text-3xl font-black text-primary-foreground drop-shadow-lg sm:text-4xl">
              {isInitiator ? activeBattle.initiator_class_name : activeBattle.target_class_name}
            </div>
            <motion.div 
              key={myScore}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="mt-6 text-6xl font-black text-destructive drop-shadow-lg sm:text-8xl"
            >
              {myScore}
            </motion.div>
          </motion.div>

          {/* VS Badge */}
          <motion.div 
            animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="z-20 flex w-2/12 justify-center"
          >
            <div className="flex size-20 -rotate-12 transform items-center justify-center rounded-full border-4 border-paper bg-gradient-to-br from-warning to-warning/70 text-3xl font-black italic text-primary-foreground shadow-glow-primary sm:size-28 sm:text-5xl">
              VS
            </div>
          </motion.div>

          {/* Enemy Class (Right) */}
          <motion.div 
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-5/12 text-center"
          >
            <div className="mb-2 text-lg font-bold text-info drop-shadow-md">敌方阵营</div>
            <div className="truncate text-3xl font-black text-primary-foreground drop-shadow-lg sm:text-4xl">
              {enemyName}
            </div>
            <motion.div 
              key={enemyScore}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="mt-6 text-6xl font-black text-info drop-shadow-lg sm:text-8xl"
            >
              {enemyScore}
            </motion.div>
          </motion.div>

        </div>

        {/* Central Progress Bar */}
        <div className="relative mt-12 w-full max-w-3xl px-8">
          <div className="relative flex h-10 w-full overflow-hidden rounded-pill border-2 border-primary-foreground/10 bg-foreground/80 shadow-raised backdrop-blur-md sm:h-14">
            <motion.div 
              className="relative h-full bg-gradient-to-r from-destructive via-destructive/80 to-destructive/60"
              initial={{ width: '50%' }}
              animate={{ width: `${myPercentage}%` }}
              transition={{ type: 'spring', bounce: 0.3 }}
            >
              {myPercentage > 50 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 font-black italic text-primary-foreground/80">
                  压制!
                </div>
              )}
            </motion.div>
            
            <motion.div 
              className="relative h-full bg-gradient-to-l from-info via-info/80 to-info/60"
              initial={{ width: '50%' }}
              animate={{ width: `${enemyPercentage}%` }}
              transition={{ type: 'spring', bounce: 0.3 }}
            >
               {enemyPercentage > 50 && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 font-black italic text-primary-foreground/80">
                  反击!
                </div>
              )}
            </motion.div>

            {/* Middle Marker */}
            <div className="absolute bottom-0 left-1/2 top-0 z-10 w-1 -translate-x-1/2 bg-primary-foreground/50" />
          </div>
          
          <p className="mt-6 text-center text-sm font-medium uppercase tracking-widest text-primary-foreground/70">
            完成课堂任务、互相点赞、或击败BOSS均可为本班增加战力
          </p>
        </div>

      </div>
    </div>
  );
}
