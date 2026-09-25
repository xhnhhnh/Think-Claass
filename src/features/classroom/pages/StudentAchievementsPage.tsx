import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Trophy, Star, Shield, Zap, Medal, Crown } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { PageScaffold } from '@/components/ui/page-scaffold';

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
  '初出茅庐': 'from-info to-role',
  '自律骑士': 'from-success to-success-ink',
  '非酋附体': 'from-role-ink to-danger',
  'DEFAULT': 'from-warning to-warning-ink'
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
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (user?.studentId) {
      fetchAchievements();
    }
  }, [user]);

  const fetchAchievements = async () => {
    try {
      if (!user?.studentId) return;
      const data = await studentsApi.getAchievements(user.studentId);
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
    <PageScaffold variant="dashboard">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-5xl space-y-8"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: -20 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
          className="relative overflow-hidden rounded-panel border border-fg-2 bg-gradient-to-br from-fg-1 to-fg-2 p-10 text-fg-inverse shadow-raised"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-40 mix-blend-overlay"></div>
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-warning opacity-40 mix-blend-screen blur-[100px] filter"></div>

          <div className="relative z-10 flex flex-col items-center justify-between text-center md:flex-row md:text-left">
            <div>
              <h2 className="mb-3 flex items-center justify-center text-4xl font-black text-fg-inverse md:justify-start">
                <Trophy className="mr-4 h-10 w-10 text-warning drop-shadow-md" />
                我的荣誉墙
              </h2>
              <p className="text-lg font-medium text-fg-inverse/70">收集所有专属徽章，见证你的成长足迹</p>
            </div>
            <div className="mt-6 rounded-card border border-fg-inverse/20 bg-fg-inverse/10 px-6 py-4 backdrop-blur-md md:mt-0">
              <div className="mb-1 text-sm font-bold text-fg-inverse/70">已解锁成就</div>
              <div className="text-3xl font-black text-warning">
                {achievements.length} <span className="text-lg text-fg-inverse/60">/ {KNOWN_ACHIEVEMENTS.length}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Grid */}
        {loading ? (
          <div className="animate-pulse py-20 text-center text-2xl font-black text-fg-3">加载中...</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {KNOWN_ACHIEVEMENTS.map((known, index) => {
              const unlockedData = achievements.find(a => a.achievement_name === known.name);
              const isUnlocked = !!unlockedData;
              const Icon = ACHIEVEMENT_ICONS[known.name] || ACHIEVEMENT_ICONS['DEFAULT'];
              const colorGradient = ACHIEVEMENT_COLORS[known.name] || ACHIEVEMENT_COLORS['DEFAULT'];

              return (
                <motion.div
                  initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.9 }) }}
                  animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
                  transition={{ delay: index * 0.1, type: "spring", bounce: 0.4 }}
                  key={known.name}
                  className={`relative overflow-hidden rounded-panel border-2 p-6 transition-all duration-500 ${
                    isUnlocked
                      ? 'border-line-1 bg-surface-2 shadow-raised hover:-translate-y-2 hover:shadow-floating'
                      : 'border-line-2 bg-surface-3/50 shadow-inset grayscale opacity-60'
                  }`}
                >
                  {/* Shine effect for unlocked */}
                  {isUnlocked && (
                    <div className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-role-contrast/40 to-transparent"></div>
                  )}

                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className={`relative mb-6 flex h-28 w-28 items-center justify-center rounded-full ${
                      isUnlocked ? 'shadow-raised' : 'bg-surface-3 shadow-inset'
                    }`}>
                      {isUnlocked && (
                        <div className={`absolute inset-0 animate-[spin_10s_linear_infinite] rounded-full bg-gradient-to-br ${colorGradient}`}></div>
                      )}
                      <div className={`absolute inset-1 flex items-center justify-center rounded-full ${isUnlocked ? 'bg-surface-2' : 'bg-transparent'}`}>
                        <Icon className={`h-12 w-12 ${isUnlocked ? 'text-fg-1' : 'text-fg-3'}`} />
                      </div>
                    </div>

                    <h3 className={`mb-2 text-2xl font-black ${isUnlocked ? 'text-fg-1' : 'text-fg-3'}`}>
                      {known.name}
                    </h3>
                    <p className={`text-sm font-medium leading-relaxed ${isUnlocked ? 'text-fg-3' : 'text-fg-3'}`}>
                      {known.description}
                    </p>

                    {isUnlocked && unlockedData && (
                      <div className="mt-6 rounded-card border border-line-1 bg-surface-3/50 px-4 py-2 text-xs font-bold text-fg-3">
                        解锁于: {new Date(unlockedData.unlocked_at).toLocaleDateString()}
                      </div>
                    )}
                    {!isUnlocked && (
                      <div className="mt-6 flex items-center rounded-card border border-line-2 bg-surface-3 px-4 py-2 text-xs font-bold text-fg-3">
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
    </PageScaffold>
  );
}
