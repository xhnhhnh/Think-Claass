import { useState } from 'react';
import { toast } from 'sonner';
import { Swords, Plus, Trash2, ShieldAlert, Trophy, Users, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useWorldBossMutation, useWorldBosses } from '@/hooks/queries/useWorldBoss';

interface WorldBoss {
  id: number;
  name: string;
  description: string;
  hp: number;
  max_hp: number;
  level: number;
  status: 'active' | 'defeated';
  start_time: string;
  end_time: string;
}

export default function TeacherWorldBoss() {
  const { data: bosses = [], isLoading: loading, refetch } = useWorldBosses();
  const bossMutation = useWorldBossMutation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hp: 10000,
    level: 1
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('请输入BOSS名称');
      return;
    }

    try {
      await bossMutation.mutateAsync({ type: 'create', data: formData });
      toast.success('召唤世界BOSS成功！');
      setIsModalOpen(false);
      setFormData({ name: '', description: '', hp: 10000, level: 1 });
      await refetch();
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个世界BOSS吗？')) return;
    
    try {
      await bossMutation.mutateAsync({ type: 'delete', id });
      toast.success('删除成功');
      await refetch();
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const activeBoss = bosses.find(b => b.status === 'active');
  const historyBosses = bosses.filter(b => b.status !== 'active');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Swords className="w-8 h-8 mr-3 text-red-500" />
            世界BOSS管理
          </h2>
          <p className="text-gray-500 mt-2">召唤全班级别的超级大魔王，让学生们合作击败它获取奖励</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!!activeBoss}
          className="flex items-center px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-5 h-5 mr-2" />
          {activeBoss ? '当前已有存活的BOSS' : '召唤新BOSS'}
        </button>
      </div>

      {/* Active Boss Status */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 flex items-center">
              <ShieldAlert className="w-5 h-5 text-red-500 mr-2" />
              当前战况
            </h3>
            <button onClick={() => refetch()} className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          ) : activeBoss ? (
            <div className="bg-red-50/50 rounded-xl p-6 border border-red-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-2xl font-black text-red-700 flex items-center">
                    {activeBoss.name}
                    <span className="ml-3 px-2 py-1 bg-red-100 text-red-600 text-xs rounded-md font-bold">Lv.{activeBoss.level}</span>
                  </h4>
                  <p className="text-red-900/60 mt-1">{activeBoss.description || '这只怪物非常可怕...'}</p>
                </div>
                <button onClick={() => handleDelete(activeBoss.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-8">
                <div className="flex justify-between text-sm font-bold text-red-900 mb-2">
                  <span>剩余血量</span>
                  <span>{activeBoss.hp} / {activeBoss.max_hp}</span>
                </div>
                <div className="h-4 w-full bg-red-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, (activeBoss.hp / activeBoss.max_hp) * 100)}%` }}
                    className="h-full bg-gradient-to-r from-red-500 to-orange-500"
                  />
                </div>
                <p className="text-xs text-red-900/50 mt-2 text-center">学生在前端挑战页面发起攻击将实时扣除此血量</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">当前风平浪静，没有世界BOSS入侵</p>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <Trophy className="w-5 h-5 text-yellow-500 mr-2" />
            击杀记录
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4 font-medium">BOSS 名称</th>
                <th className="p-4 font-medium">等级 / 总血量</th>
                <th className="p-4 font-medium">状态</th>
                <th className="p-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historyBosses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400">
                    暂无历史击杀记录
                  </td>
                </tr>
              ) : (
                historyBosses.map(boss => (
                  <tr key={boss.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-800">{boss.name}</td>
                    <td className="p-4 text-gray-600">Lv.{boss.level} / {boss.max_hp} HP</td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md font-medium">
                        已击杀
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleDelete(boss.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50">
                <h3 className="text-xl font-bold text-red-800 flex items-center">
                  <Swords className="w-5 h-5 mr-2" />
                  召唤世界BOSS
                </h3>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BOSS 名称</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    placeholder="例如：深渊魔龙、期末考试怪"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BOSS 描述</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none"
                    placeholder="描述一下这个可怕的怪物..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">总血量 (HP)</label>
                    <input
                      type="number"
                      required
                      min="100"
                      step="100"
                      value={formData.hp}
                      onChange={e => setFormData({...formData, hp: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">等级 (Level)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="100"
                      value={formData.level}
                      onChange={e => setFormData({...formData, level: Number(e.target.value)})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">* 击败后全班学生将获得 Level × 50 的积分奖励</p>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-sm font-medium flex items-center"
                  >
                    确认召唤
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
