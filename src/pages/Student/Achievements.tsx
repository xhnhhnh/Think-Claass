import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Trophy, Star, Shield, Zap, Medal, Crown } from 'lucide-react';
import { motion } from 'framer-motion';

interface Achievement {
  id: number;
  achievement_name: string;
  description: string;
  unlocked_at: string;
}

const ACHIEVEMENT_ICONS: Record<string, any> = {
  '初出茅庐': Star,
  '自律骑士': Shield,
  '非酋附体': Zap,
  'DEFAULT': Medal
};

const ACHIEVEMENT_COLORS: Record<string, string> = {
  '初出茅庐': 'from-blue-400 to-indigo-500',
  '自律骑士': 'from-green-400 to-emerald-600',
  '非酋附体': 'from-purple-400 to-fuchsia-600',
  'DEFAULT': 'from-amber-400 to-orange-500'
};

const KNOWN_ACHIEVEMENTS = [
  { name: '初出茅庐', description: '宠物等级达到 2 级，踏上魔法之旅！' },
  { name: '自律骑士', description: '完成 7 个家庭任务，展现惊人毅力！' },
  { name: '非酋附体', description: '连续 5 次抽奖未中，攒人品中...' }
];

export default function StudentAchievements() {
  const user = useStore((state) => state.user);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.studentId) {
      fetchAchievements();
    }
  }, [user]);

  const fetchAchievements = async () => {
    try {
      const res = await fetch(`/api/students/${user?.studentId}/achievements`);
      const data = await res.json();
      if (data.success) {
        setAchievements(data.achievements);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const unlockedNames = achievements.map(a => a.achievement_name);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden border border-slate-700"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-40 mix-blend-overlay"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-[100px] opacity-40"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between text-center md:text-left">
          <div>
            <h2 className="text-4xl font-black text-white mb-3 flex items-center justify-center md:justify-start">
              <Trophy className="h-10 w-10 mr-4 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
              我的荣誉墙
            </h2>
            <p className="text-lg text-slate-300 font-medium">收集所有专属徽章，见证你的成长足迹</p>
          </div>
          <div className="mt-6 md:mt-0 bg-slate-800/50 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-600/50">
            <div className="text-sm text-slate-400 font-bold mb-1">已解锁成就</div>
            <div className="text-3xl font-black text-amber-400">
              {achievements.length} <span className="text-lg text-slate-500">/ {KNOWN_ACHIEVEMENTS.length}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20 font-black text-2xl text-slate-400 animate-pulse">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {KNOWN_ACHIEVEMENTS.map((known, index) => {
            const unlockedData = achievements.find(a => a.achievement_name === known.name);
            const isUnlocked = !!unlockedData;
            const Icon = ACHIEVEMENT_ICONS[known.name] || ACHIEVEMENT_ICONS['DEFAULT'];
            const colorGradient = ACHIEVEMENT_COLORS[known.name] || ACHIEVEMENT_COLORS['DEFAULT'];

            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1, type: "spring", bounce: 0.4 }}
                key={known.name}
                className={`relative rounded-[2rem] p-6 overflow-hidden transition-all duration-500 border-2 ${
                  isUnlocked 
                    ? 'bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)] hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] border-slate-100' 
                    : 'bg-slate-50 shadow-inner border-slate-200/50 grayscale opacity-60'
                }`}
              >
                {/* Shine effect for unlocked */}
                {isUnlocked && (
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 animate-[shimmer_3s_infinite] pointer-events-none"></div>
                )}

                <div className="flex flex-col items-center text-center relative z-10">
                  <div className={`w-28 h-28 rounded-full mb-6 flex items-center justify-center relative ${
                    isUnlocked ? 'shadow-[0_10px_20px_rgba(0,0,0,0.1)]' : 'shadow-inner bg-slate-200'
                  }`}>
                    {isUnlocked && (
                      <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${colorGradient} animate-spin-slow`} style={{ animationDuration: '10s' }}></div>
                    )}
                    <div className={`absolute inset-1 rounded-full flex items-center justify-center ${isUnlocked ? 'bg-white' : 'bg-transparent'}`}>
                      <Icon className={`w-12 h-12 ${isUnlocked ? 'text-slate-800' : 'text-slate-400'}`} />
                    </div>
                  </div>
                  
                  <h3 className={`text-2xl font-black mb-2 ${isUnlocked ? 'text-slate-800' : 'text-slate-500'}`}>
                    {known.name}
                  </h3>
                  <p className={`text-sm font-medium leading-relaxed ${isUnlocked ? 'text-slate-500' : 'text-slate-400'}`}>
                    {known.description}
                  </p>

                  {isUnlocked && unlockedData && (
                    <div className="mt-6 px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-400 border border-slate-100">
                      解锁于: {new Date(unlockedData.unlocked_at).toLocaleDateString()}
                    </div>
                  )}
                  {!isUnlocked && (
                    <div className="mt-6 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-400 border border-slate-200/50 flex items-center">
                      未解锁
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}