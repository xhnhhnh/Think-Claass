import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Map as MapIcon, Plus, Settings, Play, Database, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useClasses } from '@/hooks/queries/useClasses';
import { useCreateTerritoryMutation, useTerritoryMap, useTriggerYieldMutation } from '@/hooks/queries/useTerritory';

interface Territory {
  id: number;
  class_id: number;
  name: string;
  type: 'forest' | 'mine' | 'city' | 'magic_spring';
  level: number;
  cost_to_unlock: number;
  current_contribution: number;
  x_pos: number;
  y_pos: number;
  status: 'locked' | 'unlocking' | 'owned';
}

export default function TeacherTerritory() {
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const classId = useMemo(() => classes[0]?.id ?? null, [classes]);
  const { data } = useTerritoryMap(classId);
  const territories = (data?.territories ?? []) as Territory[];
  const createMutation = useCreateTerritoryMutation();
  const yieldMutation = useTriggerYieldMutation();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'forest' as 'forest' | 'mine' | 'city' | 'magic_spring',
    cost_to_unlock: 1000,
    x_pos: 0,
    y_pos: 0
  });

  const reloadMap = async () => {
    if (!classId) return;
    await queryClient.invalidateQueries({ queryKey: ['territory-map', classId] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;

    try {
      const data = await createMutation.mutateAsync({ ...formData, class_id: classId });
      if (data.success) {
        toast.success('领地已创建');
        setIsModalOpen(false);
        await reloadMap();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const triggerYield = async () => {
    if (!classId) return;
    try {
      const data = await yieldMutation.mutateAsync(classId);
      if (data.success) {
        toast.success('已模拟产出资源');
        await reloadMap();
      }
    } catch (err) {
      toast.error('网络错误');
    }
  };

  if (!classId) return <div className="p-8 text-center text-slate-500">请先创建或选择一个班级</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <MapIcon className="w-8 h-8 mr-3 text-emerald-500" />
            领土扩张管理
          </h1>
          <p className="text-slate-500 mt-1 text-sm">配置大地图节点，设定解锁需要的全班积分捐献阈值。</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={triggerYield}
            className="px-5 py-2.5 bg-amber-100 text-amber-700 font-bold rounded-xl hover:bg-amber-200 transition-all flex items-center"
          >
            <Play className="w-5 h-5 mr-2" />
            强制结算资源
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:-translate-y-0.5 transition-all flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            配置新领地
          </button>
        </div>
      </div>

      {/* List View */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">领地列表</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 rounded-l-xl">领地名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">等级</th>
                <th className="px-4 py-3">解锁进度</th>
                <th className="px-4 py-3">坐标</th>
                <th className="px-4 py-3 rounded-r-xl">状态</th>
              </tr>
            </thead>
            <tbody>
              {territories.map(t => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-700">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{t.type}</td>
                  <td className="px-4 py-3 font-medium">Lv.{t.level}</td>
                  <td className="px-4 py-3 text-emerald-600 font-bold">
                    {t.current_contribution} / {t.cost_to_unlock}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">({t.x_pos}, {t.y_pos})</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                      t.status === 'owned' ? 'bg-emerald-100 text-emerald-700' :
                      t.status === 'unlocking' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {t.status === 'owned' ? '已解锁' : t.status === 'unlocking' ? '收集中' : '未解锁'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl max-w-md w-full border border-emerald-100"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">新建领地节点</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">领地名称</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
                    placeholder="如: 叹息森林"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">地形产出类型</label>
                    <select
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value as any})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="forest">森林 (木材)</option>
                      <option value="mine">矿洞 (石石)</option>
                      <option value="city">城邦 (金币)</option>
                      <option value="magic_spring">魔泉 (星尘)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">解锁所需总积分</label>
                    <input
                      type="number"
                      min="100"
                      value={formData.cost_to_unlock}
                      onChange={e => setFormData({...formData, cost_to_unlock: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">X 坐标偏差 (px)</label>
                    <input
                      type="number"
                      value={formData.x_pos}
                      onChange={e => setFormData({...formData, x_pos: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Y 坐标偏差 (px)</label>
                    <input
                      type="number"
                      value={formData.y_pos}
                      onChange={e => setFormData({...formData, y_pos: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-colors mt-6"
                >
                  确认部署领地
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
