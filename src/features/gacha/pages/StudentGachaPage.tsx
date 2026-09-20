import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Sparkles, Star, Zap, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useGachaDrawMutation, useGachaPools } from '@/features/gacha/hooks/useGacha';
import type { GachaPetResult } from '@/features/gacha/api/gachaApi';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';

export default function StudentGacha() {
  const user = useStore(state => state.user);
  const classId = user?.class_id ?? null;
  const studentId = user?.studentId ?? user?.id ?? null;
  const { data: pools = [], isLoading: loading } = useGachaPools(classId);
  const drawMutation = useGachaDrawMutation(studentId);
  const [results, setResults] = useState<GachaPetResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleDraw = async (poolId: number, times: number) => {
    try {
      const data = await drawMutation.mutateAsync({ poolId, times });
      if (data.success) {
        const results = data.data?.results ?? data.results ?? [];
        setResults(results);
        setShowResults(true);
        
        // Trigger confetti for SSR or SR
        const hasHighRarity = results.some((r) => r.rarity === 'SSR' || r.rarity === 'SR');
        if (hasHighRarity) {
          setTimeout(() => {
            void launchConfetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.6 },
              colors: [...CELEBRATION.brand]
            });
          }, 500);
        }
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  /**
   * Rarity frames.
   *
   * The four gradients are the summon's whole reward language, so they stay gradients -
   * the rarity colours are just the token scale: the gold pull is `warning`, the
   * featured one is the deep-sky accent, and the plain one is `info`.
   */
  const getRarityColor = (rarity: string) => {
    switch(rarity) {
      case 'SSR': return 'from-warning to-warning/60 text-paper shadow-warning/50 border-warning';
      case 'SR': return 'from-accent-foreground to-info text-paper shadow-info/50 border-accent-foreground';
      case 'R': return 'from-info to-info/60 text-paper shadow-info/50 border-info';
      default: return 'from-ink-3 to-ink-2 text-paper shadow-ink-2/50 border-ink-3';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-ink-3">
        <Spinner size="lg" label="连接星空法阵中" />
        连接星空法阵中...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <PageHeader
        title="星空召唤法阵"
        description="消耗积分，召唤属于你的强力魔法守护兽"
        icon={Sparkles}
      />

      {/* The starfield is the page's stage: the summon happens inside it, so it stays
          dark while everything around it is on the tokens. */}
      <div className="relative min-h-[600px] overflow-hidden rounded-panel bg-ink-1 p-6 sm:p-10">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 animate-[spin_120s_linear_infinite] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[100px]" />
        </div>

        <div className="relative z-10">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            {pools.map(pool => (
              <motion.div
                key={pool.id}
                whileHover={{ y: -10 }}
                className="group relative overflow-hidden rounded-panel border border-paper/20 bg-paper/10 p-8 shadow-raised backdrop-blur-xl"
              >
                {/* Card Glint Effect */}
                <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-tr from-paper/0 via-paper/10 to-paper/0 transition-transform duration-1000 group-hover:translate-x-[100%]" />
                
                <h3 className="mb-2 text-2xl font-bold text-paper">{pool.name}</h3>
                
                <div className="mb-8 flex flex-wrap gap-2">
                  <Badge variant="warning" className="border-warning/50 bg-warning/20 font-bold">
                    SSR: {(pool.ssr_rate * 100).toFixed(1)}%
                  </Badge>
                  <Badge variant="info" className="border-accent-foreground/30 bg-accent font-bold text-accent-foreground">
                    SR: {(pool.sr_rate * 100).toFixed(1)}%
                  </Badge>
                  <Badge variant="info" className="border-info/50 bg-info/20 font-bold">
                    R: {(pool.r_rate * 100).toFixed(1)}%
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="ghost"
                    onClick={() => handleDraw(pool.id, 1)}
                    disabled={drawMutation.isPending}
                    className="h-auto flex-col rounded-card border border-paper/20 bg-paper/5 p-4 text-paper hover:bg-paper/10 hover:text-paper"
                  >
                    <span className="mb-1 text-lg font-bold text-paper">单次召唤</span>
                    <span className="flex items-center text-sm text-accent">
                      <Zap className="mr-1 size-4" /> {pool.cost_points}
                    </span>
                  </Button>
                  <Button
                    onClick={() => handleDraw(pool.id, 10)}
                    disabled={drawMutation.isPending}
                    className="h-auto flex-col rounded-card border border-accent-foreground bg-gradient-to-br from-primary to-accent-foreground p-4 hover:from-primary/90 hover:to-accent-foreground/90"
                  >
                    <span className="mb-1 text-lg font-bold text-primary-foreground">十连召唤</span>
                    <span className="flex items-center text-sm text-accent">
                      <Zap className="mr-1 size-4" /> {pool.cost_points * 10}
                    </span>
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Modal */}
      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/90 p-4 backdrop-blur-md"
          >
            <div className="w-full max-w-5xl">
              <h2 className="mb-12 text-center text-4xl font-black text-paper drop-shadow-md">召唤结果</h2>
              
              <div className="flex flex-wrap justify-center gap-6">
                {results.map((pet, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, rotateY: 180 }}
                    animate={{ scale: 1, rotateY: 0 }}
                    transition={{ delay: i * 0.1, type: 'spring', bounce: 0.4 }}
                    className={`group relative h-48 w-32 overflow-hidden rounded-card bg-gradient-to-br p-1 shadow-raised sm:h-56 sm:w-40 ${getRarityColor(pet.rarity)}`}
                  >
                    <div className="absolute inset-1 flex flex-col items-center justify-between rounded-card border border-paper/20 bg-ink-1/40 p-3 backdrop-blur-sm">
                      <div className="flex w-full items-start justify-between">
                        <span className="text-lg font-black drop-shadow-md">{pet.rarity}</span>
                        {pet.rarity === 'SSR' && <Star className="size-5 animate-pulse fill-warning text-warning" />}
                      </div>
                      
                      <div className="flex size-16 items-center justify-center rounded-full border border-paper/10 bg-ink-1/30 transition-transform group-hover:scale-110 sm:size-20">
                        <Shield className="size-8 opacity-80" />
                      </div>
                      
                      <div className="w-full text-center">
                        <div className="truncate px-1 text-xs font-bold drop-shadow-md sm:text-sm">{pet.name}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-paper/70">{pet.element}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-16 text-center">
                <Button
                  variant="ghost"
                  onClick={() => setShowResults(false)}
                  className="h-auto rounded-card border border-paper/30 bg-paper/10 px-10 py-4 font-bold text-paper backdrop-blur-md hover:bg-paper/20 hover:text-paper"
                >
                  确认收下
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
