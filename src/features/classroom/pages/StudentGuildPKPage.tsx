import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Swords, Crown, Flame, ShieldAlert, AlertCircle, Medal } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

import { PageScaffold } from '@/components/ui/page-scaffold';
import { classroomApi } from '@/features/classroom/api/classesApi';
import { studentsApi } from '@/features/classroom/api/studentsApi';

interface GuildRanking {
  id: number;
  name: string;
  total_score: number;
}

export default function StudentGuildPK() {
  const user = useStore((state) => state.user);
  const [rankings, setRankings] = useState<GuildRanking[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [studentClassId, setStudentClassId] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const init = async () => {
      if (!user?.studentId) return;
      try {
        const studentData = await studentsApi.getStudents();
        if (studentData.success) {
          const student = studentData.students.find((s: any) => s.id === user.studentId);
          if (student) {
            setStudentClassId(student.class_id);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    init();
  }, [user]);

  useEffect(() => {
    if (!studentClassId) return;
    const fetchRankings = async () => {
      try {
        const data = await classroomApi.getGuildRanking(studentClassId);
        if (data.success) {
          setIsEnabled(data.isEnabled);
          setRankings(data.rankings);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();
  }, [studentClassId]);

  // The banner travel is decoration; the fade is what tells the reader something
  // arrived, so it is the half that survives `prefers-reduced-motion`.
  const bannerEntrance = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { y: -20, opacity: 0 }, animate: { y: 0, opacity: 1 } };

  if (loading) {
    return (
      <PageScaffold variant="immersive" className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse text-center text-2xl font-black text-fg-3">魔法雷达扫描中...</div>
      </PageScaffold>
    );
  }

  if (!isEnabled) {
    return (
      <PageScaffold
        variant="immersive"
        className="flex min-h-dvh items-center justify-center px-4 pb-12 pt-16 sm:px-6"
      >
        <div className="w-full max-w-4xl rounded-panel border-8 border-dashed border-line-1 bg-surface-2 py-32 text-center shadow-card">
          <div className="mb-6 inline-flex items-center justify-center rounded-full bg-surface-3 p-8 shadow-inset">
            <ShieldAlert className="h-16 w-16 text-fg-3" />
          </div>
          <p className="text-3xl font-black text-fg-3">魔法小队 PK 暂未开启</p>
          <p className="mt-4 text-xl font-bold text-fg-3">请等待老师开启全班公会战</p>
        </div>
      </PageScaffold>
    );
  }

  const maxScore = rankings.length > 0 ? rankings[0].total_score : 1;

  return (
    <PageScaffold variant="immersive" className="min-h-dvh px-4 pb-12 pt-16 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <motion.div
          {...bannerEntrance}
          className="relative overflow-hidden rounded-panel bg-gradient-to-r from-danger to-warning p-10 text-fg-inverse shadow-raised"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-30 mix-blend-overlay"></div>
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-warning mix-blend-screen opacity-40 blur-[80px]"></div>

          <div className="relative z-10 flex flex-col items-center justify-between text-center md:flex-row md:text-left">
            <div>
              <h2 className="mb-3 flex items-center justify-center text-4xl font-black drop-shadow-md md:justify-start">
                <Swords className="mr-4 h-10 w-10" />
                魔法小队 PK 榜
              </h2>
              <p className="text-lg font-medium text-fg-inverse/85">全班小队集结！谁将夺得最强公会的荣耀？</p>
            </div>
            <div className="mt-6 rounded-card border border-fg-inverse/30 bg-surface-2/20 px-6 py-4 text-center backdrop-blur-md md:mt-0">
              <div className="mb-1 text-sm font-bold opacity-90">参战小队</div>
              <div className="flex items-center justify-center text-4xl font-black">
                {rankings.length}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Rankings */}
        <div className="rounded-panel border-4 border-line-2 bg-surface-2 p-8 shadow-raised">
          {rankings.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center text-fg-3">
              <AlertCircle className="mb-4 h-12 w-12 opacity-50" />
              <p className="text-xl font-bold">班级还没有创建任何魔法小队哦！</p>
            </div>
          ) : (
            <div className="space-y-6">
              {rankings.map((rank, index) => {
                const progress = Math.max(5, (rank.total_score / maxScore) * 100);
                const isFirst = index === 0;
                const isSecond = index === 1;
                const isThird = index === 2;

                return (
                  <motion.div
                    key={rank.id}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`relative flex items-center gap-6 rounded-card border-2 p-6 transition-all ${
                      isFirst
                        ? 'border-warning/40 bg-gradient-to-r from-warning-soft to-warning-soft shadow-card'
                        : 'border-line-1 bg-surface-2 hover:border-line-strong'
                    }`}
                  >
                    {/* Rank Number */}
                    <div className="flex w-16 flex-shrink-0 justify-center">
                      {isFirst ? (
                        <Crown className="h-12 w-12 animate-bounce text-warning drop-shadow-md" />
                      ) : isSecond ? (
                        <Medal className="h-10 w-10 text-fg-3/70 drop-shadow-sm" />
                      ) : isThird ? (
                        <Medal className="h-10 w-10 text-warning drop-shadow-sm" />
                      ) : (
                        <span className="text-2xl font-black text-fg-3/70">{index + 1}</span>
                      )}
                    </div>

                    {/* Name and Progress */}
                    <div className="flex-1">
                      <div className="mb-2 flex items-end justify-between">
                        <h3 className={`text-xl font-black ${isFirst ? 'text-warning-ink' : 'text-fg-2'}`}>
                          {rank.name}
                        </h3>
                        <div className={`flex items-baseline text-2xl font-black ${isFirst ? 'text-warning' : 'text-fg-2'}`}>
                          <Flame className={`mr-1 h-5 w-5 ${isFirst ? 'animate-pulse text-danger' : 'text-warning'}`} />
                          {rank.total_score}
                          <span className="ml-1 text-sm font-bold text-fg-3">战力</span>
                        </div>
                      </div>

                      <div className={`h-4 w-full overflow-hidden rounded-full shadow-inset ${isFirst ? 'bg-warning-soft/70' : 'bg-surface-3'}`}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, type: 'spring' }}
                          className={`relative h-full overflow-hidden ${
                            isFirst
                              ? 'bg-gradient-to-r from-warning to-warning-ink'
                              : isSecond
                                ? 'bg-gradient-to-r from-line-strong to-fg-3'
                                : isThird
                                  ? 'bg-gradient-to-r from-warning/70 to-warning'
                                  : 'bg-gradient-to-r from-info to-role'
                          }`}
                        >
                          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-20"></div>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageScaffold>
  );
}
