import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Gift, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ShopItem {
  id: number;
  name: string;
}

interface ConfigItem {
  prize_name: string;
  prize_type: 'POINTS' | 'ITEM' | 'NONE';
  prize_value: number | '';
  probability: number;
}

export default function TeacherLuckyDrawConfig() {
  const user = useStore((state) => state.user);
  const [costPoints, setCostPoints] = useState<number>(10);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchConfigs();
      fetchShopItems();
    }
  }, [user]);

  const fetchShopItems = async () => {
    try {
      const res = await fetch(`/api/shop/all?teacherId=${user?.id}`);
      const data = await res.json();
      if (data.success) {
        setShopItems(data.items);
      }
    } catch (err) {
      console.error('Failed to fetch shop items:', err);
    }
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lucky_draw/config?teacherId=${user?.id}`);
      const data = await res.json();
      if (data.success) {
        setCostPoints(data.cost_points || 10);
        if (data.configs && data.configs.length === 9) {
          setConfigs(data.configs.map((c: any) => ({
            prize_name: c.prize_name,
            prize_type: c.prize_type,
            prize_value: c.prize_value || '',
            probability: c.probability
          })));
        } else {
          // Initialize 9 default configs
          setConfigs(Array(9).fill({ prize_name: '', prize_type: 'NONE', prize_value: '', probability: 10 }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (index: number, field: keyof ConfigItem, value: any) => {
    const newConfigs = [...configs];
    newConfigs[index] = { ...newConfigs[index], [field]: value };
    // Auto-clear value if type changes
    if (field === 'prize_type') {
      newConfigs[index].prize_value = '';
    }
    setConfigs(newConfigs);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    
    // Validation
    for (let i = 0; i < 9; i++) {
      const conf = configs[i];
      if (!conf.prize_name.trim()) {
        toast.error(`格子 ${i + 1} 的奖品名称不能为空`);
        return;
      }
      if (conf.prize_type !== 'NONE' && (conf.prize_value === '' || conf.prize_value === null)) {
        toast.error(`格子 ${i + 1} 需要设置奖品数值或选择商品`);
        return;
      }
      if (conf.probability < 0) {
        toast.error(`格子 ${i + 1} 的概率不能为负数`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/lucky_draw/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_id: user.id,
          cost_points: costPoints,
          configs
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('保存成功');
        fetchConfigs();
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch (err) {
      console.error('Save error:', err);
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading && configs.length === 0) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  const totalProbability = configs.reduce((sum, conf) => sum + (Number(conf.probability) || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center">
          <div className="p-3 bg-orange-100 rounded-xl mr-4">
            <Gift className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">九宫格抽奖设置</h2>
            <p className="text-sm text-slate-500 mt-1">设置抽奖消耗和 9 个格子的奖品与概率权重</p>
          </div>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="flex items-center bg-slate-50/50 px-4 py-2 rounded-xl border border-gray-200 w-full sm:w-auto">
            <span className="text-sm font-medium text-slate-700 mr-2 whitespace-nowrap">每次消耗:</span>
            <input
              type="number"
              min="0"
              value={costPoints}
              onChange={(e) => setCostPoints(parseInt(e.target.value) || 0)}
              className="w-20 border border-gray-300 rounded-2xl px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500 text-center"
            />
            <span className="text-sm text-slate-500 ml-2">分</span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center px-6 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl hover:from-indigo-600 hover:to-cyan-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="mb-4 flex justify-between items-center text-sm">
          <span className="text-slate-500">提示：概率权重越大，被抽中的几率越高。当前总权重: <strong className="text-slate-800">{totalProbability}</strong></span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {configs.map((conf, index) => {
            const probPercent = totalProbability > 0 ? ((Number(conf.probability) || 0) / totalProbability * 100).toFixed(1) : '0.0';
            
            return (
              <div key={index} className="bg-slate-50/50 rounded-2xl p-5 border border-gray-200 relative group hover:border-orange-300 transition-colors">
                <div className="absolute -top-3 -left-3 w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                  {index + 1}
                </div>
                
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">奖品名称</label>
                    <input
                      type="text"
                      value={conf.prize_name}
                      onChange={(e) => handleConfigChange(index, 'prize_name', e.target.value)}
                      placeholder="如：5积分 / 棒棒糖"
                      className="w-full border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">奖品类型</label>
                      <select
                        value={conf.prize_type}
                        onChange={(e) => handleConfigChange(index, 'prize_type', e.target.value)}
                        className="w-full border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="NONE">无奖励 (谢谢参与)</option>
                        <option value="POINTS">积分</option>
                        <option value="ITEM">商品 (兑换券)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">概率权重</label>
                      <input
                        type="number"
                        min="0"
                        value={conf.probability}
                        onChange={(e) => handleConfigChange(index, 'probability', parseInt(e.target.value) || 0)}
                        className="w-full border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500"
                      />
                      <div className="text-[10px] text-gray-400 mt-1 text-right">中奖率: {probPercent}%</div>
                    </div>
                  </div>

                  {conf.prize_type === 'POINTS' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">奖励积分数量</label>
                      <input
                        type="number"
                        value={conf.prize_value}
                        onChange={(e) => handleConfigChange(index, 'prize_value', parseInt(e.target.value) || 0)}
                        placeholder="输入积分数值"
                        className="w-full border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  )}

                  {conf.prize_type === 'ITEM' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">关联商品</label>
                      <select
                        value={conf.prize_value}
                        onChange={(e) => handleConfigChange(index, 'prize_value', parseInt(e.target.value) || '')}
                        className="w-full border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="" disabled>选择一个商品...</option>
                        {shopItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
