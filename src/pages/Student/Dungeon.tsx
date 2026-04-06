import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Skull, Heart, Shield, Swords, Sparkles, Tent, Zap, ArrowRight, ArrowDownToLine, RefreshCw, Box, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet, apiPost } from "@/lib/api";

interface DungeonRun {
  id: number;
  current_floor: number;
  max_floor: number;
  active_buffs: string[];
  current_hp: number;
  max_hp: number;
  status: 'active' | 'died' | 'completed';
}

interface Choice {
  id: string;
  title: string;
  description: string;
  type: 'combat' | 'event' | 'treasure' | 'rest';
  hpCost: number;
  rewardType: 'points' | 'buff' | 'heal';
  rewardValue: string | number;
}

export default function StudentDungeon() {
  const user = useStore(state => state.user);
  const [run, setRun] = useState<DungeonRun | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [bestFloor, setBestFloor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchDungeon = async () => {
    if (!user) return;
    try {
      const data = await apiGet(`/api/dungeon/${user.id}`);
      if (data.success) {
        if (data.run) {
          setRun(data.run);
          setChoices(data.choices);
        } else {
          setRun(null);
          setBestFloor(data.best_floor);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDungeon();
  }, [user]);

  const startRun = async () => {
    if (!user) return;
    setProcessing(true);
    try {
      const data = await apiPost(`/api/dungeon/start/${user.id}`, undefined);
      if (data.success) {
        toast.success('深入地下城...');
        fetchDungeon();
      } else {
        toast.error(data.message || '启动失败');
      }
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setProcessing(false);
    }
  };

  const makeChoice = async (choice: Choice) => {
    if (!user || !run) return;
    
    if (run.current_hp - choice.hpCost <= 0) {
      if (!window.confirm('此选择会导致生命值归零，确定要赴死吗？')) return;
    }

    setProcessing(true);
    try {
      const data = await apiPost(`/api/dungeon/choice/${user.id}`, choice);

      if (data.success) {
        if (data.status === 'died') {
          toast.error(`你在第 ${run.current_floor} 层倒下了...`);
          setRun(null);
        } else {
          toast.success('成功推进至下一层！');
        }
        fetchDungeon();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch (err) {
      toast.error('网络错误');
    } finally {
      setProcessing(false);
    }
  };

  const abandonRun = async () => {
    if (!user || !window.confirm('确定要放弃本次探索吗？(生命值将归零，进度重置)')) return;
    setProcessing(true);
    try {
      const data = await apiPost(`/api/dungeon/abandon/${user.id}`);
      if (data.success !== false) {
        toast.success('已逃离地下城');
        fetchDungeon();
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-12 flex justify-center"><RefreshCw className="w-8 h-8 animate-spin text-rose-500" /></div>;

  const getChoiceIcon = (type: string) => {
    switch (type) {
      case 'combat': return <Swords className="w-8 h-8 text-rose-500" />;
      case 'event': return <Sparkles className="w-8 h-8 text-purple-500" />;
      case 'treasure': return <Box className="w-8 h-8 text-amber-500" />;
      case 'rest': return <Tent className="w-8 h-8 text-emerald-500" />;
      default: return <HelpCircle className="w-8 h-8 text-slate-500" />;
    }
  };

  // ----------------------------------------
  // LOBBY VIEW (No active run)
  // ----------------------------------------
  if (!run) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8 min-h-[600px] flex flex-col justify-center relative rounded-3xl overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-slate-900 overflow-hidden z-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 mix-blend-overlay" />
          <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-red-900/50 to-transparent" />
        </div>

        <div className="relative z-10 text-center space-y-8">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-32 h-32 mx-auto bg-rose-900/50 rounded-full border-4 border-rose-500/30 flex items-center justify-center shadow-[0_0_50px_rgba(225,29,72,0.4)]"
          >
            <Skull className="w-16 h-16 text-rose-500 animate-pulse" />
          </motion.div>
          
          <div>
            <h1 className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-4 tracking-tighter">
              深渊无尽塔
            </h1>
            <p className="text-slate-400 text-lg max-w-lg mx-auto">
              每次进入都是随机生成的房间与挑战。合理规划你的生命值，尽可能深入，获取遗物与巨额积分奖励。
            </p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10">
              <span className="text-slate-400 uppercase text-xs font-bold tracking-widest block mb-1">历史最高层数</span>
              <span className="text-3xl font-black text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                {bestFloor} <span className="text-lg text-amber-500/50">F</span>
              </span>
            </div>

            <button
              onClick={startRun}
              disabled={processing}
              className="group relative px-12 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-xl rounded-2xl transition-all hover:scale-105 shadow-[0_0_30px_rgba(225,29,72,0.4)] hover:shadow-[0_0_50px_rgba(225,29,72,0.6)] disabled:opacity-50 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              {processing ? '连接深渊中...' : '踏入深渊'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------
  // ACTIVE RUN VIEW
  // ----------------------------------------
  const hpPercentage = (run.current_hp / run.max_hp) * 100;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 min-h-[800px] flex flex-col relative rounded-3xl overflow-hidden shadow-2xl border border-rose-900/30">
      {/* Immersive Dungeon Background */}
      <div className="absolute inset-0 bg-slate-950 overflow-hidden z-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-40 mix-blend-overlay" />
        
        {/* Floor Indicator Depth Effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[30vw] font-black text-white/5 select-none pointer-events-none">
          {run.current_floor}
        </div>
        
        {/* Red Vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(159,18,57,0.3)] pointer-events-none" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Top HUD */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/50 backdrop-blur-xl p-6 rounded-3xl border border-white/10 mb-12">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <span className="text-rose-500 font-black text-4xl drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]">{run.current_floor}</span>
              <span className="text-slate-500 font-bold text-xs block uppercase tracking-widest mt-1">当前层数</span>
            </div>
            
            <div className="h-12 w-px bg-white/10" />
            
            {/* HP Bar */}
            <div className="w-48 sm:w-64">
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-rose-400 flex items-center"><Heart className="w-4 h-4 mr-1" /> 生命值</span>
                <span className="text-white">{run.current_hp} / {run.max_hp}</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <motion.div 
                  className={`h-full ${hpPercentage > 50 ? 'bg-emerald-500' : hpPercentage > 20 ? 'bg-amber-500' : 'bg-rose-600 animate-pulse'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${hpPercentage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto">
            {/* Buffs Area */}
            <div className="flex flex-wrap gap-2">
              {run.active_buffs.map((buff, i) => (
                <div key={i} className="w-10 h-10 bg-purple-900/50 border border-purple-500/30 rounded-xl flex items-center justify-center group relative cursor-help">
                  <Zap className="w-5 h-5 text-purple-400" />
                  <div className="absolute top-full mt-2 w-max px-3 py-1 bg-black text-xs text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {buff}
                  </div>
                </div>
              ))}
              {run.active_buffs.length === 0 && (
                <span className="text-slate-600 text-sm font-medium">暂无遗物</span>
              )}
            </div>

            <button 
              onClick={abandonRun}
              className="ml-auto p-3 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
              title="逃离地下城 (放弃进度)"
            >
              <ArrowDownToLine className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Room Choices */}
        <div className="flex-1 flex flex-col justify-center items-center pb-12">
          <h2 className="text-2xl font-bold text-white mb-12 flex items-center">
            选择下一扇门... <ArrowRight className="w-6 h-6 ml-3 text-rose-500 animate-pulse" />
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-5xl">
            <AnimatePresence mode="popLayout">
              {choices.map((choice, index) => (
                <motion.button
                  key={`${run.current_floor}-${choice.id}`}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -10 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => makeChoice(choice)}
                  disabled={processing}
                  className="group relative flex flex-col items-center p-8 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-3xl text-left hover:border-rose-500/50 hover:bg-slate-800 transition-all shadow-xl hover:shadow-[0_10px_30px_rgba(225,29,72,0.2)] disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 rounded-3xl pointer-events-none" />
                  
                  <div className="relative z-10 flex flex-col items-center w-full">
                    <div className="w-20 h-20 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                      {getChoiceIcon(choice.type)}
                    </div>
                    
                    <h3 className="text-xl font-black text-white mb-2">{choice.title}</h3>
                    <p className="text-slate-400 text-sm text-center mb-6 h-10">{choice.description}</p>

                    <div className="w-full space-y-2 pt-6 border-t border-slate-700/50">
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-slate-500">代价</span>
                        <span className="text-rose-400 flex items-center">
                          <Heart className="w-4 h-4 mr-1" /> -{choice.hpCost} HP
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-slate-500">奖励预测</span>
                        <span className={`flex items-center ${
                          choice.rewardType === 'points' ? 'text-amber-400' : 
                          choice.rewardType === 'buff' ? 'text-purple-400' : 'text-emerald-400'
                        }`}>
                          {choice.rewardType === 'points' && `+${choice.rewardValue} 积分`}
                          {choice.rewardType === 'buff' && `未知遗物`}
                          {choice.rewardType === 'heal' && `+${choice.rewardValue} HP`}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}