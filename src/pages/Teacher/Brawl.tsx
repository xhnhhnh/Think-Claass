import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Swords, ShieldAlert, Crosshair, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { battlesApi, type Battle } from '@/api/battles';
import { useBattleActionMutation, useBattleStats, useInitiateBattleMutation, useTeacherBattles } from '@/hooks/queries/useBattles';
import { useClasses } from '@/hooks/queries/useClasses';

export default function TeacherBrawl() {
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const classId = useMemo(() => classes[0]?.id ?? null, [classes]);
  const { data: battles = [] } = useTeacherBattles(classId);
  const activeBattle = battles.find(b => b.status === 'active') ?? null;
  const { data: activeStats } = useBattleStats(activeBattle?.id ?? null, !!activeBattle);
  const initiateMutation = useInitiateBattleMutation();
  const actionMutation = useBattleActionMutation();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{id: number, name: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const reloadBattles = async () => {
    if (!classId) return;
    await queryClient.invalidateQueries({ queryKey: ['teacher-battles', classId] });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !classId) return;
    
    setIsSearching(true);
    try {
      const data = await battlesApi.searchClasses(
        searchQuery,
        classId,
      );

      if (data.success) {
        setSearchResults(data.classes);
        if (data.classes.length === 0) toast.info('未找到其他班级');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const initiateBattle = async (targetId: number, targetName: string) => {
    if (!classId) return;
    
    if (!window.confirm(`确定要向 [${targetName}] 发起大乱斗挑战吗？`)) return;

    try {
      const data = await initiateMutation.mutateAsync({ initiator_class_id: classId, target_class_id: targetId });

      if (data.success) {
        toast.success('挑战已发出！等待对方教师接受。');
        setSearchQuery('');
        setSearchResults([]);
        await reloadBattles();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleAction = async (battleId: number, action: 'accept' | 'reject' | 'end') => {
    try {
      let winnerClassId: number | null | undefined;
      if (action === 'end' && activeStats) {
        // Determine winner
        const winnerId = activeStats.initiatorScore > activeStats.targetScore 
          ? activeStats.battle.initiator_class_id 
          : (activeStats.targetScore > activeStats.initiatorScore ? activeStats.battle.target_class_id : null);
        winnerClassId = winnerId;
      }

      const data = await actionMutation.mutateAsync({
        battleId,
        action,
        winnerClassId,
      });
      if (data.success) {
        toast.success(`操作成功: ${action}`);
        await reloadBattles();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  if (!classId) return <div className="p-8 text-center text-slate-500">请先创建或选择一个班级</div>;

  const pendingReceived = battles.filter(b => b.status === 'pending' && b.target_class_id === classId);
  const pendingSent = battles.filter(b => b.status === 'pending' && b.initiator_class_id === classId);

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <Swords className="w-8 h-8 mr-3 text-rose-500" />
            校区跨班大乱斗
          </h1>
          <p className="text-slate-500 mt-1">挑战其他班级，争夺校区最强魔法分院荣誉！</p>
        </div>
      </div>

      {/* Active Battle Dashboard */}
      {activeBattle && activeStats && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 rounded-3xl p-8 shadow-2xl relative overflow-hidden border border-slate-800"
        >
          {/* VS Background */}
          <div className="absolute inset-0 flex">
            <div className="w-1/2 bg-rose-900/20" />
            <div className="w-1/2 bg-blue-900/20" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
            <Swords className="w-96 h-96 text-white" />
          </div>

          <div className="relative z-10">
            <div className="flex justify-between items-center mb-12">
              <div className="text-center w-1/3">
                <div className="text-rose-400 font-bold text-xl mb-2">
                  {activeBattle.initiator_class_id === classId ? '本班 (红方)' : '敌班 (红方)'}
                </div>
                <div className="text-white text-3xl font-black">{activeBattle.initiator_class_name}</div>
                <div className="text-rose-500 text-5xl font-black mt-4 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">
                  {activeStats.initiatorScore}
                </div>
              </div>

              <div className="text-center w-1/3">
                <div className="text-yellow-500 font-black text-6xl italic drop-shadow-lg">VS</div>
                <div className="text-slate-400 mt-4 text-sm font-mono flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> 战况实时同步中
                </div>
              </div>

              <div className="text-center w-1/3">
                <div className="text-blue-400 font-bold text-xl mb-2">
                  {activeBattle.target_class_id === classId ? '本班 (蓝方)' : '敌班 (蓝方)'}
                </div>
                <div className="text-white text-3xl font-black">{activeBattle.target_class_name}</div>
                <div className="text-blue-500 text-5xl font-black mt-4 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                  {activeStats.targetScore}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-6 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              <motion.div 
                className="h-full bg-gradient-to-r from-rose-600 to-rose-400"
                initial={{ width: '50%' }}
                animate={{ 
                  width: `${activeStats.initiatorScore + activeStats.targetScore === 0 ? 50 : (activeStats.initiatorScore / (activeStats.initiatorScore + activeStats.targetScore)) * 100}%` 
                }}
                transition={{ type: 'spring', bounce: 0.2 }}
              />
              <motion.div 
                className="h-full bg-gradient-to-l from-blue-600 to-blue-400"
                initial={{ width: '50%' }}
                animate={{ 
                  width: `${activeStats.initiatorScore + activeStats.targetScore === 0 ? 50 : (activeStats.targetScore / (activeStats.initiatorScore + activeStats.targetScore)) * 100}%` 
                }}
                transition={{ type: 'spring', bounce: 0.2 }}
              />
            </div>

            <div className="mt-8 flex justify-center">
              <button 
                onClick={() => handleAction(activeBattle.id, 'end')}
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-900/50 transition-all hover:scale-105"
              >
                结束大乱斗并结算
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Search & Initiate */}
        {!activeBattle && (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Crosshair className="w-5 h-5 mr-2 text-indigo-500" />
              寻找对手
            </h3>
            <form onSubmit={handleSearch} className="flex gap-3 mb-6">
              <input
                type="text"
                placeholder="输入班级名称搜索..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button 
                type="submit" 
                disabled={isSearching || !searchQuery.trim()}
                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {isSearching ? '搜索中...' : '搜索'}
              </button>
            </form>

            <div className="space-y-3">
              {searchResults.map(c => (
                <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="font-bold text-slate-700">{c.name}</span>
                  <button
                    onClick={() => initiateBattle(c.id, c.name)}
                    className="px-4 py-2 bg-rose-100 text-rose-700 hover:bg-rose-200 font-bold rounded-lg transition-colors text-sm"
                  >
                    发起挑战
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Requests */}
        <div className="space-y-6">
          {pendingReceived.length > 0 && (
            <div className="bg-amber-50 rounded-3xl p-6 border border-amber-200 shadow-lg">
              <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-amber-600" />
                收到的挑战战书 ({pendingReceived.length})
              </h3>
              <div className="space-y-3">
                {pendingReceived.map(b => (
                  <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-2xl border border-amber-100 gap-4">
                    <span className="font-bold text-slate-800">
                      来自: <span className="text-rose-600">{b.initiator_class_name}</span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(b.id, 'accept')}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors text-sm"
                      >
                        应战
                      </button>
                      <button
                        onClick={() => handleAction(b.id, 'reject')}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors text-sm"
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingSent.length > 0 && (
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
              <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center">
                <ShieldAlert className="w-5 h-5 mr-2 text-slate-500" />
                已发出的挑战
              </h3>
              <div className="space-y-3">
                {pendingSent.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100">
                    <span className="font-medium text-slate-600">
                      等待 <span className="font-bold text-slate-800">{b.target_class_name}</span> 迎战
                    </span>
                    <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-700 rounded-full animate-pulse">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Battle History */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">历史战役记录</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 rounded-l-xl">发起方</th>
                <th className="px-4 py-3">迎战方</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 rounded-r-xl">获胜方</th>
              </tr>
            </thead>
            <tbody>
              {battles.filter(b => b.status === 'ended' || b.status === 'rejected').slice(0, 10).map(b => (
                <tr key={b.id} className="border-b border-slate-50 last:border-0">
                  <td className={`px-4 py-3 font-medium ${b.initiator_class_id === classId ? 'text-indigo-600' : 'text-slate-700'}`}>
                    {b.initiator_class_name}
                  </td>
                  <td className={`px-4 py-3 font-medium ${b.target_class_id === classId ? 'text-indigo-600' : 'text-slate-700'}`}>
                    {b.target_class_name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${b.status === 'ended' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'}`}>
                      {b.status === 'ended' ? '已结束' : '已拒绝'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-600">
                    {b.winner_class_id === b.initiator_class_id ? b.initiator_class_name : (b.winner_class_id === b.target_class_id ? b.target_class_name : '-')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
