import { useEffect, useState } from 'react';
import { LineChart, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { CrudPage, type CrudField } from '@/components/crud/CrudPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useClasses } from '@/hooks/queries/useClasses';
import { useTeacherStockMutation, useTeacherStocks } from '../hooks/useEconomy';
import type { StockDto, StockPayload } from '../types';

type StockForm = StockPayload & Record<string, unknown>;

function sparklinePoints(history: string | null) {
  if (!history) return [];
  try {
    const parsed = JSON.parse(history);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

/**
 * Sparkline.
 *
 * The stroke was the hex literal `#4f46e5` - the indigo this product does not use -
 * so it is the `primary` token now, through `stroke-primary` rather than
 * `style={{ stroke }}`: the whole point of the token layer is that a page never writes
 * a colour value.
 */
function Sparkline({ history }: { history: string | null }) {
  const points = sparklinePoints(history);
  if (points.length < 2) return <div className="h-10 text-xs text-ink-3">暂无走势</div>;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);
  const path = points.map((point, index) => `${index * step},${100 - ((point - min) / range) * 100}`).join(' L ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full">
      <path d={`M ${path}`} fill="none" className="stroke-primary" strokeWidth="4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const fields: CrudField<StockForm>[] = [
  { name: 'name', label: '股票名称', type: 'text', required: true, placeholder: '例如：课堂之星' },
  { name: 'symbol', label: '股票代码', type: 'text', required: true, placeholder: '例如：STAR' },
  { name: 'current_price', label: '当前价格', type: 'number', required: true, min: 1 },
];

/**
 * 股票管理.
 *
 * The class picker above the `CrudPage` is the kit's `Select` (it had grown its own
 * indigo focus ring), and the tile below is tokenised: the price chip, the sparkline
 * well and the footer note were indigo, slate and emerald, and the sparkline stroke was
 * a hex literal. Every `teacherApi`-family call, the payload shape and the three test
 * contracts (`股票名称`, `保存`, `删除课堂之星`) are unchanged.
 */
export default function TeacherEconomyPage() {
  const { data: classes = [] } = useClasses();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const { data: stocks = [], isLoading } = useTeacherStocks(selectedClassId || null);
  const stockMutation = useTeacherStockMutation(selectedClassId || null);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(String(classes[0].id));
    }
  }, [classes, selectedClassId]);

  const classId = Number(selectedClassId);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Select
          aria-label="选择班级"
          wrapperClassName="w-48"
          value={selectedClassId}
          onChange={(event) => setSelectedClassId(event.target.value)}
        >
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </Select>
      </div>

      <CrudPage<StockDto, StockForm>
        title="股票管理"
        description="为当前班级创建股票、调整价格，并查看最近价格走势"
        addLabel="新增股票"
        emptyTitle="暂无挂牌股票"
        emptyDescription="添加第一支股票后，学生可在银行股市里交易"
        icon={LineChart}
        items={stocks}
        isLoading={isLoading}
        fields={fields}
        createInitialForm={() => ({ class_id: classId, name: '', symbol: '', current_price: 100 })}
        mapItemToForm={(item) => ({
          class_id: item.class_id,
          name: item.name,
          symbol: item.symbol,
          current_price: item.current_price,
        })}
        getItemId={(item) => item.id}
        getItemTitle={(item) => item.name}
        validateForm={(form) => {
          if (!selectedClassId) return '请先选择班级';
          if (!form.name.trim()) return '请输入股票名称';
          if (!form.symbol.trim()) return '请输入股票代码';
          if (!form.current_price || form.current_price <= 0) return '当前价格必须大于 0';
          return null;
        }}
        onCreate={async (form) => {
          await stockMutation.mutateAsync({ type: 'create', data: { ...form, class_id: classId } });
          toast.success('股票已创建');
        }}
        onUpdate={async (id, form) => {
          await stockMutation.mutateAsync({ type: 'update', stockId: id, data: { ...form, class_id: classId } });
          toast.success('股票已更新');
        }}
        onDelete={async (id) => {
          await stockMutation.mutateAsync({ type: 'delete', stockId: id });
          toast.success('股票已删除');
        }}
        renderItem={(item, actions) => (
          <Card className="h-full">
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-ink-1">{item.name}</div>
                  <div className="font-mono text-xs text-ink-3">{item.symbol}</div>
                </div>
                <div className="rounded-card bg-primary/5 px-3 py-1 text-sm font-bold text-primary">{item.current_price} 积分</div>
              </div>
              <div className="rounded-card bg-muted/50 p-3">
                <Sparkline history={item.trend_history} />
              </div>
              <div className="mt-auto flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => actions.openEdit(item)}>
                  <Pencil data-icon="inline-start" />
                  编辑
                </Button>
                <Button type="button" variant="destructive" aria-label={`删除${item.name}`} onClick={() => actions.requestDelete(item)}>
                  <Trash2 data-icon="inline-start" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      />
      <div className="flex items-center gap-2 rounded-card bg-success/10 px-4 py-3 text-sm font-medium text-success">
        <TrendingUp className="h-4 w-4" />
        学生端行情每 15 秒自动刷新一次。
      </div>
    </div>
  );
}
