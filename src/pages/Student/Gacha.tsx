import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Sparkles, Star, Zap, Shield, HelpCircle, ShieldAlert, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

import { apiGet, apiPost } from "@/lib/api";

interface GachaPool {
  id: number;
  name: string;
  cost_points: number;
  ssr_rate: number;
  sr_rate: number;
  r_rate: number;
  n_rate: number;
}

interface PetResult {
  id: number;
  name: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  element: string;
}

export default function StudentGacha() {
  const user = useStore(state => state.user);
  const [pools, setPools] = useState<GachaPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [results, setResults] = useState<PetResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (user?.class_id) {
      fetch(`/api/gacha/pools/${user.class_id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setPools(data.pools);
          setLoading(false);
        });
    }
  }, [user]);

  const handleDraw = async (poolId: number, times: number) => {
    if (!user) return;
    setDrawing(true);
    try {
      const data = await apiPost(`/api/gacha/draw/${user.id}`, { poolId, times });
      if (data.success) {
        setResults(data.results);
        setShowResults(true);
        
        // Trigger confetti for SSR or SR
        const hasHighRarity = data.results.some((r: PetResult) => r.rarity === 'SSR' || r.rarity === 'SR');
        if (hasHighRarity) {
          setTimeout(() => {
            confetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.6 },
              colors: ['#fbbf24', '#f59e0b', '#fcd34d']
            });
          }, 500);
        }
      } else {
        toast.error(data.message || '召唤失败');
      }
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setDrawing(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch(rarity) {
      case 'SSR': return 'from-amber-400 via-yellow-500 to-amber-600 text-white shadow-amber-500/50 border-amber-300';
      case 'SR': return 'from-purple-500 to-indigo-600 text-white shadow-purple-500/50 border-purple-300';
      case 'R': return 'from-blue-400 to-cyan-500 text-white shadow-blue-500/50 border-blue-300';
      default: return 'from-slate-400 to-slate-500 text-white shadow-slate-500/50 border-slate-300';
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500">连接星空法阵中...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8 relative min-h-[800px] overflow-hidden rounded-3xl">
      {/* Immersive Background */}
      <div className="absolute inset-0 bg-slate-900 overflow-hidden z-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay animate-[spin_120s_linear_infinite]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none" />
      </div>

      <div className="relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 mb-4 flex items-center justify-center drop-shadow-lg">
            <Sparkles className="w-10 h-10 mr-3 text-purple-400" />
            星空召唤法阵
          </h1>
          <p className="text-indigo-200/80 text-lg">消耗积分，召唤属于你的强力魔法守护兽</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {pools.map(pool => (
            <motion.div
              key={pool.id}
              whileHover={{ y: -10 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden group"
            >
              {/* Card Glint Effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              
              <h3 className="text-2xl font-bold text-white mb-2">{pool.name}</h3>
              
              <div className="flex flex-wrap gap-2 mb-8">
                <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/50 text-amber-300 rounded-full text-xs font-bold">SSR: {(pool.ssr_rate * 100).toFixed(1)}%</span>
                <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/50 text-purple-300 rounded-full text-xs font-bold">SR: {(pool.sr_rate * 100).toFixed(1)}%</span>
                <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/50 text-blue-300 rounded-full text-xs font-bold">R: {(pool.r_rate * 100).toFixed(1)}%</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleDraw(pool.id, 1)}
                  disabled={drawing}
                  className="flex flex-col items-center justify-center p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all disabled:opacity-50"
                >
                  <span className="text-white font-bold text-lg mb-1">单次召唤</span>
                  <span className="text-indigo-300 text-sm flex items-center"><Zap className="w-4 h-4 mr-1"/> {pool.cost_points}</span>
                </button>
                <button
                  onClick={() => handleDraw(pool.id, 10)}
                  disabled={drawing}
                  className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 border border-purple-400/50 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all disabled:opacity-50"
                >
                  <span className="text-white font-bold text-lg mb-1">十连召唤</span>
                  <span className="text-purple-200 text-sm flex items-center"><Zap className="w-4 h-4 mr-1"/> {pool.cost_points * 10}</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Results Modal */}
      <AnimatePresence>
        {showResults && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4"
          >
            <div className="max-w-5xl w-full">
              <h2 className="text-4xl font-black text-center text-white mb-12 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">召唤结果</h2>
              
              <div className="flex flex-wrap justify-center gap-6">
                {results.map((pet, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, rotateY: 180 }}
                    animate={{ scale: 1, rotateY: 0 }}
                    transition={{ delay: i * 0.1, type: 'spring', bounce: 0.4 }}
                    className={`w-32 h-48 sm:w-40 sm:h-56 rounded-2xl bg-gradient-to-br ${getRarityColor(pet.rarity)} p-1 shadow-2xl relative overflow-hidden group`}
                  >
                    <div className="absolute inset-1 bg-slate-900/40 backdrop-blur-sm rounded-xl p-3 flex flex-col items-center justify-between border border-white/20">
                      <div className="w-full flex justify-between items-start">
                        <span className="font-black text-lg drop-shadow-md">{pet.rarity}</span>
                        {pet.rarity === 'SSR' && <Star className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-pulse" />}
                      </div>
                      
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-black/30 rounded-full flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                        <Shield className="w-8 h-8 opacity-80" />
                      </div>
                      
                      <div className="text-center w-full">
                        <div className="text-xs sm:text-sm font-bold truncate px-1 drop-shadow-md">{pet.name}</div>
                        <div className="text-[10px] text-white/70 uppercase mt-1 tracking-wider">{pet.element}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-16 text-center">
                <button
                  onClick={() => setShowResults(false)}
                  className="px-10 py-4 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold rounded-2xl backdrop-blur-md transition-all hover:scale-105"
                >
                  确认收下
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}