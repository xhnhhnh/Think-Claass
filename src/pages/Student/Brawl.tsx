import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Swords, RefreshCw, Flame, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

interface Battle {
  id: number;
  initiator_class_id: number;
  target_class_id: number;
  initiator_class_name: string;
  target_class_name: string;
  status: 'pending' | 'active' | 'ended' | 'rejected';
  start_time: string;
  end_time: string;
  winner_class_id: number | null;
}

export default function StudentBrawl() {
  const user = useStore((state) => state.user);
  const [activeBattle, setActiveBattle] = useState<Battle | null>(null);
  const [stats, setStats] = useState<{initiatorScore: number, targetScore: number} | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveBattle = async () => {
    if (!user?.class_id) return;
    try {
      const res = await fetch(`/api/battles/teacher/${user.class_id}`);
      const data = await res.json();
      if (data.success) {
        const active = data.battles.find((b: Battle) => b.status === 'active');
        setActiveBattle(active || null);
        if (active) {
          fetchStats(active.id);
        } else {
          setStats(null);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (battleId: number) => {
    try {
      const res = await fetch(`/api/battles/stats/${battleId}`);
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user?.class_id) {
      fetchActiveBattle();
      const interval = setInterval(fetchActiveBattle, 5000); // Fast poll 5s for student
      return () => clearInterval(interval);
    }
  }, [user?.class_id]);

  if (loading) {
    return <div className="p-12 flex justify-center"><RefreshCw className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  if (!activeBattle || !stats) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60 mt-12">
        <div className="w-24 h-24 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <Swords className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">风平浪静</h2>
        <p className="text-slate-500 text-lg">目前没有正在进行的跨班大乱斗。<br/>请随时准备好，战争随时可能爆发！</p>
      </div>
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
    <div className="max-w-5xl mx-auto p-4 sm:p-8 relative min-h-[600px] flex flex-col justify-center overflow-hidden rounded-3xl">
      {/* Immersive Background */}
      <div className="absolute inset-0 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 flex opacity-30">
          <motion.div 
            animate={{ width: `${myPercentage}%` }} 
            transition={{ type: "spring", bounce: 0.1 }}
            className="h-full bg-gradient-to-r from-rose-600 to-rose-900" 
          />
          <motion.div 
            animate={{ width: `${enemyPercentage}%` }} 
            transition={{ type: "spring", bounce: 0.1 }}
            className="h-full bg-gradient-to-l from-blue-600 to-blue-900" 
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
          <div className="inline-flex items-center px-4 py-2 bg-black/50 backdrop-blur-md rounded-full text-rose-400 font-bold border border-rose-500/30 mb-8 shadow-[0_0_15px_rgba(225,29,72,0.3)]">
            <Flame className="w-5 h-5 mr-2 animate-pulse" />
            跨班大乱斗正在进行中
          </div>
        </motion.div>

        {/* Combatants */}
        <div className="w-full flex items-center justify-between px-4 sm:px-12">
          
          {/* My Class (Left) */}
          <motion.div 
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-5/12 text-center"
          >
            <div className="text-rose-200 font-bold text-lg mb-2 drop-shadow-md">本班阵营</div>
            <div className="text-white text-3xl sm:text-4xl font-black drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] truncate">
              {isInitiator ? activeBattle.initiator_class_name : activeBattle.target_class_name}
            </div>
            <motion.div 
              key={myScore}
              initial={{ scale: 1.5, color: '#fff' }}
              animate={{ scale: 1, color: '#f43f5e' }}
              className="text-rose-500 text-6xl sm:text-8xl font-black mt-6 drop-shadow-[0_0_25px_rgba(244,63,94,0.6)]"
            >
              {myScore}
            </motion.div>
          </motion.div>

          {/* VS Badge */}
          <motion.div 
            animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-2/12 flex justify-center z-20"
          >
            <div className="w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center border-4 border-white shadow-[0_0_30px_rgba(234,179,8,0.5)] text-white font-black text-3xl sm:text-5xl italic transform -rotate-12">
              VS
            </div>
          </motion.div>

          {/* Enemy Class (Right) */}
          <motion.div 
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-5/12 text-center"
          >
            <div className="text-blue-200 font-bold text-lg mb-2 drop-shadow-md">敌方阵营</div>
            <div className="text-white text-3xl sm:text-4xl font-black drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] truncate">
              {enemyName}
            </div>
            <motion.div 
              key={enemyScore}
              initial={{ scale: 1.5, color: '#fff' }}
              animate={{ scale: 1, color: '#3b82f6' }}
              className="text-blue-500 text-6xl sm:text-8xl font-black mt-6 drop-shadow-[0_0_25px_rgba(59,130,246,0.6)]"
            >
              {enemyScore}
            </motion.div>
          </motion.div>

        </div>

        {/* Central Progress Bar */}
        <div className="w-full max-w-3xl px-8 mt-12 relative">
          <div className="h-10 sm:h-14 w-full bg-slate-800/80 backdrop-blur-md rounded-full overflow-hidden flex shadow-[0_0_30px_rgba(0,0,0,0.8)] border-2 border-slate-700 relative">
            <motion.div 
              className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 relative"
              initial={{ width: '50%' }}
              animate={{ width: `${myPercentage}%` }}
              transition={{ type: 'spring', bounce: 0.3 }}
            >
              {myPercentage > 50 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 font-black italic">
                  压制!
                </div>
              )}
            </motion.div>
            
            <motion.div 
              className="h-full bg-gradient-to-l from-blue-600 via-blue-500 to-blue-400 relative"
              initial={{ width: '50%' }}
              animate={{ width: `${enemyPercentage}%` }}
              transition={{ type: 'spring', bounce: 0.3 }}
            >
               {enemyPercentage > 50 && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 font-black italic">
                  反击!
                </div>
              )}
            </motion.div>

            {/* Middle Marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-white/50 -translate-x-1/2 z-10" />
          </div>
          
          <p className="text-center text-slate-400 text-sm mt-6 font-medium tracking-widest uppercase">
            完成课堂任务、互相点赞、或击败BOSS均可为本班增加战力
          </p>
        </div>

      </div>
    </div>
  );
}