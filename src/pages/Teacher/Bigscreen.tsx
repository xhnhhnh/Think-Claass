import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Maximize, Users, Award, Star, TrendingUp, ShieldAlert, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import DanmakuOverlay from '@/components/DanmakuOverlay';
import ClassFeaturePanel from './components/ClassFeaturePanel';

import { apiGet } from "@/lib/api";
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { defaultClassFeatures } from '@/lib/classFeatures';

interface ClassItem {
  id: number;
  name: string;
  invite_code: string;
}

export default function TeacherBigscreen() {
  const user = useStore((state) => state.user);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [bigscreenData, setBigscreenData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownInput, setCountdownInput] = useState('10');
  const [showCountdownConfig, setShowCountdownConfig] = useState(false);
  const [prevBossHp, setPrevBossHp] = useState<number | null>(null);
  const { data: classFeatureData } = useClassFeatures(selectedClassId);
  const classFeatures = classFeatureData?.features ?? defaultClassFeatures;

  useEffect(() => {
    fetchClasses();
  }, []);

  // Handle Boss Defeat Animation
  useEffect(() => {
    if (classFeatures.enable_world_boss && bigscreenData?.activeBoss) {
      if (prevBossHp !== null && bigscreenData.activeBoss.hp === 0 && prevBossHp > 0) {
        confetti({
          particleCount: 200,
          spread: 160,
          origin: { y: 0.3 },
          colors: ['#ff0000', '#ff7700', '#ffff00']
        });
      }
      setPrevBossHp(bigscreenData.activeBoss.hp);
    }
  }, [bigscreenData?.activeBoss?.hp, classFeatures.enable_world_boss, prevBossHp]);

  // Handle Countdown Timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => setCountdown(prev => prev! - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const fetchClasses = async () => {
    try {
      const data = await apiGet('/api/classes');
      if (data.success) {
        setClasses(data.classes);
        if (data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchBigscreenData();
      const interval = setInterval(fetchBigscreenData, 10000); // refresh every 10s
      return () => clearInterval(interval);
    }
  }, [selectedClassId]);

  const fetchBigscreenData = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const data = await apiGet(`/api/classes/${selectedClassId}/bigscreen`);
      if (data.success) {
        setBigscreenData(data);
      }
    } catch (err) {
      console.error('Failed to fetch bigscreen data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        toast.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const startCountdown = () => {
    const mins = parseInt(countdownInput, 10);
    if (isNaN(mins) || mins <= 0) return;
    setCountdown(mins * 60);
    setShowCountdownConfig(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!classes.length) {
    return <div className="p-8 text-center text-slate-500">暂无班级数据，请先创建班级。</div>;
  }

  const isBossActive = classFeatures.enable_world_boss && bigscreenData?.activeBoss && bigscreenData.activeBoss.hp > 0;

  return (
    <div className={`flex flex-col h-full relative ${isFullscreen ? 'bg-gray-900 text-white fixed inset-0 z-50 p-8 overflow-y-auto' : 'space-y-6'}`}>
      {selectedClassId && classFeatures.enable_danmaku ? <DanmakuOverlay classId={selectedClassId} /> : null}
      {/* Background Particles for Fullscreen */}
      {isFullscreen && (
        <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-[#0B0C10]">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px] mix-blend-screen transition-all duration-1000 ${isBossActive ? 'bg-red-600/30 animate-pulse' : 'bg-transparent'}`}></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
        </div>
      )}
      {!isFullscreen && (
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">选择班级:</span>
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassId(cls.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedClassId === cls.id
                    ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                    : 'bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50'
                }`}
              >
                {cls.name}
              </button>
            ))}
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium flex-shrink-0 ml-4"
          >
            <Maximize className="h-4 w-4 mr-2" />
            进入大屏模式
          </button>
        </div>
      )}

      {!isFullscreen && selectedClassId && (
        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">大屏功能摘要</h2>
              <p className="text-sm text-slate-500">关闭弹幕后将停止展示课堂弹幕，关闭世界 Boss 后大屏也会同步隐藏相关区块</p>
            </div>
          </div>
          <ClassFeaturePanel classId={selectedClassId} compact />
        </div>
      )}

      {isFullscreen && (
        <div className="flex justify-between items-center mb-8 relative z-10">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-500 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] tracking-tight">
            {bigscreenData?.class?.name} <span className="text-gray-400 font-normal">|</span> 光荣榜
          </h1>
          <div className="flex items-center space-x-4">
            {/* Countdown Timer Button/Display */}
            <div className="relative">
              {countdown !== null ? (
                <div 
                  onClick={() => setCountdown(null)}
                  className={`cursor-pointer px-6 py-3 rounded-2xl text-3xl font-black font-mono transition-all border-2 flex items-center shadow-[0_0_20px_rgba(0,0,0,0.3)] ${
                    countdown <= 60 
                      ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse shadow-red-500/30' 
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-500/30'
                  }`}
                  title="点击取消倒计时"
                >
                  <Clock className="w-8 h-8 mr-3" />
                  {formatTime(countdown)}
                </div>
              ) : (
                <button
                  onClick={() => setShowCountdownConfig(!showCountdownConfig)}
                  className="px-6 py-3 bg-gray-800/80 hover:bg-gray-700/80 rounded-2xl text-gray-300 font-bold transition-all border border-gray-700 flex items-center backdrop-blur-md"
                >
                  <Clock className="w-5 h-5 mr-2" />
                  专注倒计时
                </button>
              )}

              {/* Config Popover */}
              <AnimatePresence>
                {showCountdownConfig && countdown === null && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full mt-4 right-0 bg-gray-800 border border-gray-700 rounded-2xl p-4 shadow-2xl w-64 z-50 backdrop-blur-xl"
                  >
                    <label className="block text-sm text-gray-400 mb-2 font-medium">设置倒计时 (分钟)</label>
                    <div className="flex space-x-2">
                      <input 
                        type="number" 
                        value={countdownInput}
                        onChange={e => setCountdownInput(e.target.value)}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500 font-mono text-lg"
                        min="1"
                      />
                      <button 
                        onClick={startCountdown}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors"
                      >
                        开始
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[5, 10, 15, 20, 30, 45].map(m => (
                        <button
                          key={m}
                          onClick={() => { setCountdownInput(m.toString()); }}
                          className="py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={toggleFullscreen}
              className="px-6 py-3 bg-gray-800/80 hover:bg-gray-700/80 rounded-2xl text-sm font-bold transition-all border border-gray-700 backdrop-blur-md text-gray-300"
            >
              退出大屏
            </button>
          </div>
        </div>
      )}

      {/* World Boss Alert Section */}
      <AnimatePresence>
        {isBossActive && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.9 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.9 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            className={`relative z-10 w-full rounded-[2rem] overflow-hidden shadow-2xl mb-8 ${
              isFullscreen ? 'bg-gray-900/80 border-2 border-red-500/50 backdrop-blur-xl' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 mix-blend-overlay"></div>
            <div className="p-8 relative flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center flex-1 w-full">
                <div className={`p-4 rounded-2xl mr-6 flex-shrink-0 shadow-inner ${isFullscreen ? 'bg-red-500/20' : 'bg-red-100'}`}>
                  <ShieldAlert className={`w-12 h-12 ${isFullscreen ? 'text-red-400' : 'text-red-500'} animate-pulse`} />
                </div>
                <div className="flex-1 w-full">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <h2 className={`text-3xl font-black tracking-tight ${isFullscreen ? 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)]' : 'text-red-700'}`}>
                        ⚠️ 世界BOSS降临: {bigscreenData.activeBoss.name}
                      </h2>
                      <p className={`text-sm mt-1 font-medium ${isFullscreen ? 'text-red-300/80' : 'text-red-600/80'}`}>
                        Lv.{bigscreenData.activeBoss.level} - {bigscreenData.activeBoss.description || '请全班同学前往挑战！'}
                      </p>
                    </div>
                    <div className={`text-2xl font-black font-mono ${isFullscreen ? 'text-red-400' : 'text-red-700'}`}>
                      {bigscreenData.activeBoss.hp} / {bigscreenData.activeBoss.max_hp}
                    </div>
                  </div>
                  {/* HP Bar */}
                  <div className={`h-6 w-full rounded-full overflow-hidden shadow-inner ${isFullscreen ? 'bg-gray-800/80' : 'bg-red-200/50'}`}>
                    <motion.div 
                      initial={{ width: '100%' }}
                      animate={{ width: `${Math.max(0, (bigscreenData.activeBoss.hp / bigscreenData.activeBoss.max_hp) * 100)}%` }}
                      transition={{ type: 'spring', bounce: 0 }}
                      className={`h-full relative overflow-hidden ${
                        isFullscreen 
                          ? 'bg-gradient-to-r from-red-600 to-orange-500' 
                          : 'bg-gradient-to-r from-red-500 to-orange-400'
                      }`}
                    >
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-30 animate-[slideRight_2s_linear_infinite]"></div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && !bigscreenData ? (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      ) : bigscreenData ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
          {/* Top Students */}
          <div className={`col-span-1 lg:col-span-2 rounded-3xl p-6 ${isFullscreen ? 'bg-gray-800 border-gray-700' : 'bg-white/80 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60'}`}>
            <h2 className={`text-2xl font-bold mb-6 flex items-center ${isFullscreen ? 'text-white' : 'text-slate-800'}`}>
              <Award className={`w-8 h-8 mr-3 ${isFullscreen ? 'text-yellow-400' : 'text-yellow-500'}`} />
              积分排行榜 (Top 10)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bigscreenData.topStudents.map((student: any, index: number) => (
                <div 
                  key={student.id}
                  className={`flex items-center p-4 rounded-2xl ${
                    index === 0 ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-200' :
                    index === 1 ? 'bg-gradient-to-r from-gray-200 to-gray-100 border border-gray-300' :
                    index === 2 ? 'bg-gradient-to-r from-orange-200 to-orange-100 border border-orange-300' :
                    isFullscreen ? 'bg-gray-700 border border-gray-600' : 'bg-slate-50/50 border border-white/60'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg mr-4 ${
                    index === 0 ? 'bg-yellow-400 text-white shadow-md' :
                    index === 1 ? 'bg-gray-400 text-white shadow-md' :
                    index === 2 ? 'bg-orange-400 text-white shadow-md' :
                    isFullscreen ? 'bg-gray-600 text-gray-300' : 'bg-white/80 backdrop-blur-xl text-slate-500 shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className={`font-bold text-lg ${isFullscreen && index > 2 ? 'text-gray-200' : 'text-slate-800'}`}>
                      {student.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${
                      index === 0 ? 'text-yellow-600' :
                      index === 1 ? 'text-slate-600' :
                      index === 2 ? 'text-orange-600' :
                      isFullscreen ? 'text-green-400' : 'text-indigo-600'
                    }`}>
                      {student.total_points}
                    </div>
                    <div className={`text-xs ${isFullscreen ? 'text-gray-400' : 'text-slate-500'}`}>总积分</div>
                  </div>
                </div>
              ))}
              {bigscreenData.topStudents.length === 0 && (
                <div className={`col-span-full py-12 text-center ${isFullscreen ? 'text-slate-500' : 'text-gray-400'}`}>
                  暂无学生数据
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Latest Praises */}
            <div className={`rounded-3xl p-6 ${isFullscreen ? 'bg-gray-800 border-gray-700' : 'bg-white/80 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60'}`}>
              <h2 className={`text-xl font-bold mb-4 flex items-center ${isFullscreen ? 'text-white' : 'text-slate-800'}`}>
                <Star className={`w-6 h-6 mr-2 ${isFullscreen ? 'text-yellow-400' : 'text-yellow-500'}`} />
                最新表扬
              </h2>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                {bigscreenData.latestPraises.map((praise: any) => (
                  <div key={praise.id} className={`p-3 rounded-xl ${praise.color || 'bg-yellow-50'} border border-yellow-100`}>
                    <div className="font-bold text-slate-800 mb-1">{praise.student_name}</div>
                    <div className="text-sm text-slate-700">{praise.content}</div>
                  </div>
                ))}
                {bigscreenData.latestPraises.length === 0 && (
                  <div className={`text-center py-8 ${isFullscreen ? 'text-slate-500' : 'text-gray-400'}`}>暂无表扬记录</div>
                )}
              </div>
            </div>

            {/* Latest Points */}
            <div className={`rounded-3xl p-6 ${isFullscreen ? 'bg-gray-800 border-gray-700' : 'bg-white/80 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60'}`}>
              <h2 className={`text-xl font-bold mb-4 flex items-center ${isFullscreen ? 'text-white' : 'text-slate-800'}`}>
                <TrendingUp className={`w-6 h-6 mr-2 ${isFullscreen ? 'text-green-400' : 'text-indigo-500'}`} />
                积分动态
              </h2>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                {bigscreenData.latestRecords.map((record: any) => (
                  <div key={record.id} className={`flex items-center justify-between p-3 rounded-xl ${isFullscreen ? 'bg-gray-700' : 'bg-indigo-50/50'}`}>
                    <div>
                      <span className={`font-bold mr-2 ${isFullscreen ? 'text-gray-200' : 'text-slate-800'}`}>{record.student_name}</span>
                      <span className={`text-sm ${isFullscreen ? 'text-gray-400' : 'text-slate-600'}`}>{record.content}</span>
                    </div>
                    <div className="font-bold text-indigo-500">+{record.amount}</div>
                  </div>
                ))}
                {bigscreenData.latestRecords.length === 0 && (
                  <div className={`text-center py-8 ${isFullscreen ? 'text-slate-500' : 'text-gray-400'}`}>暂无加分记录</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
