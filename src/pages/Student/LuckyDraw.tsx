import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Gift, Star, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface PrizeConfig {
  prize_name: string;
  prize_type: 'POINTS' | 'ITEM' | 'NOTHING';
  prize_value: number;
}

export default function StudentLuckyDraw() {
  const user = useStore((state) => state.user);
  const [configs, setConfigs] = useState<PrizeConfig[]>([]);
  const [costPoints, setCostPoints] = useState(10);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<{ prize_name: string; message: string } | null>(null);
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

  const fetchData = async () => {
    if (!user?.studentId) return;
    try {
      const res = await fetch(`/api/students`);
      const data = await res.json();
      if (data.success) {
        const student = data.students.find((s: any) => s.id === user.studentId);
        if (student) setAvailablePoints(student.available_points);
      }

      const studentData = data.students.find((s: any) => s.id === user.studentId);
      let tId = 1;
      if (studentData && studentData.class_id) {
        const clsRes = await fetch(`/api/classes`);
        const clsData = await clsRes.json();
        const cls = clsData.classes?.find((c: any) => c.id === studentData.class_id);
        if (cls) tId = cls.teacher_id;
      }

      const configRes = await fetch(`/api/lucky-draw/config?teacherId=${tId}`);
      const configData = await configRes.json();
      if (configData.success) {
        setConfigs(configData.configs);
        if (configData.cost_points) setCostPoints(configData.cost_points);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleDraw = async (index: number) => {
    if (drawing || flippedIndex !== null) return;
    if (availablePoints < costPoints) {
      toast.error('积分不足');
      return;
    }

    setDrawing(true);
    setResult(null);
    setFlippedIndex(index);

    try {
      const res = await fetch('/api/lucky-draw/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user?.studentId })
      });
      const data = await res.json();
      
      // Delay to show animation
      setTimeout(() => {
        if (data.success) {
          setResult({ prize_name: data.prize.prize_name, message: data.message });
          toast.success(data.message);
          fetchData(); // Refresh points
        } else {
          toast.error(data.message || '抽奖失败');
          setFlippedIndex(null);
        }
        setDrawing(false);
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
      setFlippedIndex(null);
      setDrawing(false);
    }
  };

  const resetDraw = () => {
    setResult(null);
    setFlippedIndex(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
      </div>
    );
  }

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
        className="bg-white rounded-[2rem] p-10 shadow-xl border-b-8 border-purple-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-fuchsia-400 opacity-10 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-fuchsia-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 mb-6 md:mb-0 text-center md:text-left">
          <h2 className="text-5xl font-black text-gray-900 mb-4 drop-shadow-sm flex items-center justify-center md:justify-start">
            <Gift className="w-12 h-12 text-purple-500 mr-4" />
            幸运翻牌
          </h2>
          <p className="text-xl text-gray-600 font-bold">试试你的手气，看看能翻出什么大奖！</p>
        </div>
        
        <motion.div 
          whileHover={{ scale: 1.05, rotate: -2 }}
          className="relative z-10 flex items-center bg-white p-6 rounded-[2rem] shadow-2xl border-b-8 border-r-4 border-l-4 border-t-4 border-purple-300"
        >
          <div className="bg-purple-100 p-4 rounded-full mr-5 shadow-inner">
            <Star className="h-10 w-10 text-purple-500 fill-current" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">我的可用积分</p>
            <p className="text-4xl font-black text-purple-600 leading-none">
              {availablePoints} <span className="text-xl font-bold">币</span>
            </p>
          </div>
        </motion.div>
      </motion.div>

      {configs.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-[3rem] p-16 text-center border-8 border-dashed border-gray-200 shadow-sm"
        >
          <div className="inline-flex items-center justify-center p-8 bg-gray-100 rounded-full mb-6 shadow-inner">
            <Gift className="h-16 w-16 text-gray-400" />
          </div>
          <h3 className="text-3xl font-black text-gray-600">暂未配置抽奖</h3>
          <p className="text-xl font-bold text-gray-400 mt-4">老师还没有配置抽奖奖品哦</p>
        </motion.div>
      ) : (
        <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border-8 border-purple-100">
          <div className="text-center mb-10">
            <span className="inline-flex items-center px-6 py-3 rounded-[1.5rem] bg-purple-100 text-purple-800 font-black text-xl border-b-4 border-purple-300 shadow-sm">
              每次抽奖消耗 {costPoints} 积分
            </span>
          </div>

          <div className="grid grid-cols-3 gap-6 md:gap-8 max-w-3xl mx-auto perspective-1000">
            {Array.from({ length: 9 }).map((_, index) => (
              <motion.div
                key={index}
                whileHover={flippedIndex === null ? { scale: 1.05, y: -5 } : {}}
                whileTap={flippedIndex === null ? { scale: 0.95 } : {}}
                onClick={() => handleDraw(index)}
                className={`relative w-full aspect-[3/4] cursor-pointer transition-transform duration-700 transform-style-3d ${
                  flippedIndex === index ? 'rotate-y-180' : ''
                } ${flippedIndex !== null && flippedIndex !== index ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {/* Front of card */}
                <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-purple-500 to-fuchsia-500 rounded-[2rem] shadow-xl border-b-8 border-r-4 border-l-4 border-t-4 border-purple-700 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
                  <Sparkles className="w-16 h-16 text-white/80 drop-shadow-md animate-pulse" />
                </div>
                
                {/* Back of card */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white rounded-[2rem] shadow-2xl border-8 border-yellow-400 flex flex-col items-center justify-center p-6 text-center">
                  {flippedIndex === index && result ? (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3, type: "spring" }}
                    >
                      <Gift className="w-16 h-16 text-yellow-500 mb-4 mx-auto drop-shadow-md" />
                      <p className="font-black text-gray-800 text-2xl leading-tight">
                        {result.prize_name}
                      </p>
                    </motion.div>
                  ) : (
                    <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {result && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-16 text-center"
              >
                <div className="inline-block p-8 bg-yellow-50 border-8 border-yellow-300 rounded-[2.5rem] shadow-2xl">
                  <h3 className="text-4xl font-black text-yellow-600 mb-4 drop-shadow-sm">翻牌结果</h3>
                  <p className="text-2xl text-gray-800 font-bold mb-8">{result.message}</p>
                  <motion.button
                    whileHover={{ scale: 1.05, y: -4 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={resetDraw}
                    className="px-12 py-4 bg-purple-500 text-white rounded-[2rem] font-black text-2xl hover:bg-purple-400 transition-colors shadow-xl border-b-8 border-purple-700"
                  >
                    再翻一次
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </motion.div>
  );
}
