import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Swords, Trophy, Crown, Flame, ShieldAlert, AlertCircle, Medal } from 'lucide-react';
import { motion } from 'framer-motion';

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

  useEffect(() => {
    const init = async () => {
      if (!user?.studentId) return;
      try {
        const studentRes = await fetch(`/api/students`);
        const studentData = await studentRes.json();
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
        const res = await fetch(`/api/classes/${studentClassId}/guild-ranking`);
        const data = await res.json();
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

  if (loading) return <div className="text-center py-20 font-black text-2xl text-slate-400 animate-pulse">魔法雷达扫描中...</div>;

  if (!isEnabled) {
    return (
      <div className="max-w-4xl mx-auto text-center py-32 bg-white rounded-[3rem] border-8 border-dashed border-slate-200 shadow-sm">
        <div className="inline-flex items-center justify-center p-8 bg-slate-100 rounded-full mb-6 shadow-inner">
          <ShieldAlert className="h-16 w-16 text-slate-400" />
        </div>
        <p className="text-3xl font-black text-slate-500">魔法小队 PK 暂未开启</p>
        <p className="text-xl font-bold text-slate-400 mt-4">请等待老师开启全班公会战</p>
      </div>
    );
  }

  const maxScore = rankings.length > 0 ? rankings[0].total_score : 1;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-r from-red-600 to-orange-600 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden text-white"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-30 mix-blend-overlay"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-yellow-400 rounded-full mix-blend-screen filter blur-[80px] opacity-40"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between text-center md:text-left">
          <div>
            <h2 className="text-4xl font-black mb-3 flex items-center justify-center md:justify-start drop-shadow-md">
              <Swords className="h-10 w-10 mr-4" />
              魔法小队 PK 榜
            </h2>
            <p className="text-lg text-red-100 font-medium">全班小队集结！谁将夺得最强公会的荣耀？</p>
          </div>
          <div className="mt-6 md:mt-0 bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/30 text-center">
            <div className="text-sm font-bold mb-1 opacity-90">参战小队</div>
            <div className="text-4xl font-black flex items-center justify-center">
              {rankings.length}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Rankings */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border-4 border-slate-50">
        {rankings.length === 0 ? (
          <div className="text-center py-16 text-slate-400 flex flex-col items-center">
            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
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
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  key={rank.id}
                  className={`relative p-6 rounded-2xl border-2 transition-all flex items-center gap-6 ${
                    isFirst 
                      ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300 shadow-[0_0_20px_rgba(253,224,71,0.3)]' 
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {/* Rank Number */}
                  <div className="w-16 flex-shrink-0 flex justify-center">
                    {isFirst ? (
                      <Crown className="w-12 h-12 text-yellow-500 drop-shadow-md animate-bounce" />
                    ) : isSecond ? (
                      <Medal className="w-10 h-10 text-slate-300 drop-shadow-sm" />
                    ) : isThird ? (
                      <Medal className="w-10 h-10 text-orange-400 drop-shadow-sm" />
                    ) : (
                      <span className="text-2xl font-black text-slate-300">{index + 1}</span>
                    )}
                  </div>

                  {/* Name and Progress */}
                  <div className="flex-1">
                    <div className="flex justify-between items-end mb-2">
                      <h3 className={`text-xl font-black ${isFirst ? 'text-yellow-700' : 'text-slate-700'}`}>
                        {rank.name}
                      </h3>
                      <div className={`text-2xl font-black flex items-baseline ${isFirst ? 'text-amber-600' : 'text-slate-600'}`}>
                        <Flame className={`w-5 h-5 mr-1 ${isFirst ? 'text-red-500 animate-pulse' : 'text-orange-400'}`} />
                        {rank.total_score}
                        <span className="text-sm font-bold text-slate-400 ml-1">战力</span>
                      </div>
                    </div>

                    <div className={`h-4 w-full rounded-full overflow-hidden shadow-inner ${isFirst ? 'bg-yellow-200/50' : 'bg-slate-100'}`}>
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, type: "spring" }}
                        className={`h-full relative overflow-hidden ${
                          isFirst ? 'bg-gradient-to-r from-yellow-400 to-orange-500' : 
                          isSecond ? 'bg-gradient-to-r from-slate-300 to-slate-400' :
                          isThird ? 'bg-gradient-to-r from-orange-300 to-orange-400' :
                          'bg-gradient-to-r from-blue-400 to-indigo-400'
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
  );
}