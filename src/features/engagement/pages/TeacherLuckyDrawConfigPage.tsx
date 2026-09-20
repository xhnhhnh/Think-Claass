import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Gift, Save } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { useQuery } from '@tanstack/react-query';

import { shopApi } from '@/features/marketplace/api/shopApi';
import { useLuckyDrawConfig, useSaveLuckyDrawConfigMutation } from '@/hooks/queries/useLuckyDraw';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

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

/**
 * 九宫格抽奖设置.
 *
 * The nine cells are the game surface here, so they keep a staggered `motion` entrance
 * and their own amber weight badge - the layout is not a list. What changed is the
 * chrome: the header, the controls and the labels come from the kit, so every cell
 * field is a labelled `FormField` instead of a raw input with a sibling `<label>`, and
 * the whole page is one `Card` panel rather than two translucent boxes.
 */
export default function TeacherLuckyDrawConfig() {
  const user = useStore((state) => state.user);
  const [costPoints, setCostPoints] = useState<number>(10);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const { data: shopItems = [] } = useQuery({
    queryKey: ['teacher-shop-items', user?.id],
    queryFn: async () => {
      const data = await shopApi.getTeacherItems(user?.id);
      return data.items as ShopItem[];
    },
    enabled: !!user?.id,
  });
  const { data: configData, isLoading: loading, refetch } = useLuckyDrawConfig(user?.id ?? null);
  const saveMutation = useSaveLuckyDrawConfigMutation(user?.id ?? null);
  const saving = saveMutation.isPending;

  useEffect(() => {
    if (!configData) return;
    setCostPoints(configData.cost_points || 10);
    if (configData.configs && configData.configs.length === 9) {
      setConfigs(
        configData.configs.map((c: any) => ({
          prize_name: c.prize_name,
          prize_type: c.prize_type,
          prize_value: c.prize_value || '',
          probability: c.probability,
        })),
      );
    } else {
      setConfigs(Array(9).fill({ prize_name: '', prize_type: 'NONE', prize_value: '', probability: 10 }));
    }
  }, [configData]);

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

    try {
      await saveMutation.mutateAsync({
        teacher_id: user.id,
        cost_points: costPoints,
        configs,
      });
      toast.success('保存成功');
      await refetch();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('网络错误');
    }
  };

  if (loading && configs.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-ink-3">
        <Spinner label="正在加载抽奖配置" />
        加载中...
      </div>
    );
  }

  const totalProbability = configs.reduce((sum, conf) => sum + (Number(conf.probability) || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="九宫格抽奖设置"
        description="设置抽奖消耗和 9 个格子的奖品与概率权重"
        icon={Gift}
        actions={
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" label="保存中" /> : <Save data-icon="inline-start" />}
            {saving ? '保存中...' : '保存设置'}
          </Button>
        }
      />

      <Card className="rounded-panel border-border bg-paper/80 backdrop-blur-xl">
        <CardContent className="space-y-6 px-6 sm:px-8">
          <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
            <FormField label="每次消耗:" className="w-full sm:w-44">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={costPoints}
                  onChange={(e) => setCostPoints(parseInt(e.target.value) || 0)}
                  className="w-24 text-center"
                />
                <span className="text-sm text-ink-3">分</span>
              </div>
            </FormField>
            <p className="text-sm text-ink-3">
              提示：概率权重越大，被抽中的几率越高。当前总权重: <strong className="text-ink-1">{totalProbability}</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {configs.map((conf, index) => {
              const probPercent = totalProbability > 0 ? ((Number(conf.probability) || 0) / totalProbability * 100).toFixed(1) : '0.0';

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="relative rounded-panel border border-border bg-muted/50 p-5 pt-7 transition-colors hover:border-warning/40"
                >
                  <div className="absolute -top-3 -left-3 flex size-8 items-center justify-center rounded-full border-2 border-paper bg-warning/10 font-bold text-warning shadow-card">
                    {index + 1}
                  </div>

                  <div className="space-y-4">
                    <FormField label="奖品名称">
                      <Input
                        type="text"
                        value={conf.prize_name}
                        onChange={(e) => handleConfigChange(index, 'prize_name', e.target.value)}
                        placeholder="如：5积分 / 棒棒糖"
                      />
                    </FormField>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="奖品类型">
                        <Select
                          value={conf.prize_type}
                          onChange={(e) => handleConfigChange(index, 'prize_type', e.target.value)}
                        >
                          <option value="NONE">无奖励 (谢谢参与)</option>
                          <option value="POINTS">积分</option>
                          <option value="ITEM">商品 (兑换券)</option>
                        </Select>
                      </FormField>
                      <FormField label="概率权重" hint={`中奖率: ${probPercent}%`}>
                        <Input
                          type="number"
                          min="0"
                          value={conf.probability}
                          onChange={(e) => handleConfigChange(index, 'probability', parseInt(e.target.value) || 0)}
                        />
                      </FormField>
                    </div>

                    {conf.prize_type === 'POINTS' && (
                      <FormField label="奖励积分数量">
                        <Input
                          type="number"
                          value={conf.prize_value}
                          onChange={(e) => handleConfigChange(index, 'prize_value', parseInt(e.target.value) || 0)}
                          placeholder="输入积分数值"
                        />
                      </FormField>
                    )}

                    {conf.prize_type === 'ITEM' && (
                      <FormField label="关联商品">
                        <Select
                          value={conf.prize_value}
                          onChange={(e) => handleConfigChange(index, 'prize_value', parseInt(e.target.value) || '')}
                        >
                          <option value="" disabled>选择一个商品...</option>
                          {shopItems.map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </Select>
                      </FormField>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
