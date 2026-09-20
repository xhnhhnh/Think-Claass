import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Briefcase, Building2, Coins, PiggyBank, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { useEconomyBankMutation, useEconomyData, useEconomyTradeMutation } from '@/features/economy/hooks/useEconomy';
import type { BankAccountDto, PortfolioItemDto, StockDto } from '@/features/economy/types';

/** Trend history is a JSON string column; a malformed one means "no chart", not a crash. */
function parseTrend(history: string | null): number[] {
  try {
    const points = JSON.parse(history || '[]');
    return Array.isArray(points) ? (points as number[]) : [];
  } catch {
    return [];
  }
}

/**
 * Sparkline.
 *
 * Module scope on purpose: it used to be declared inside the page body, so React saw a
 * new component type on every render and remounted the `<svg>` - which is why the chart
 * flickered while the deposit field was being typed in.
 */
function Sparkline({ history }: { history: string | null }) {
  const points = parseTrend(history);
  if (points.length < 2) return <div className="flex h-10 items-center text-xs text-ink-3">无数据</div>;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = 100 / (points.length - 1);

  const path = points.map((p, i) => `${i * step},${100 - ((p - min) / range) * 100}`).join(' L');
  const isUp = points[points.length - 1] >= points[points.length - 2];

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-12 w-24 overflow-visible">
      <path
        d={`M 0,${100 - ((points[0] - min) / range) * 100} L ${path}`}
        fill="none"
        className={isUp ? 'stroke-success' : 'stroke-destructive'}
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function StudentEconomy() {
  const user = useStore(state => state.user);
  const studentId = user?.studentId ?? user?.id ?? null;
  const classId = user?.class_id ?? null;
  const { data, isLoading: loading, refetch } = useEconomyData(studentId, classId);
  const bank = (data?.bank ?? null) as BankAccountDto | null;
  const stocks = (data?.stocks ?? []) as StockDto[];
  const portfolio = (data?.portfolio ?? []) as PortfolioItemDto[];
  const bankMutation = useEconomyBankMutation(studentId);
  const tradeMutation = useEconomyTradeMutation(studentId);

  // Dialogs
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankAction, setBankAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [bankAmount, setBankAmount] = useState('');

  const [selectedStock, setSelectedStock] = useState<StockDto | null>(null);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [tradeShares, setTradeShares] = useState('');

  const handleBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amount = parseInt(bankAmount);
    if (isNaN(amount) || amount <= 0) return toast.error('请输入有效金额');

    try {
      await bankMutation.mutateAsync({ action: bankAction, amount });
      toast.success(bankAction === 'deposit' ? '存款成功！' : '取款成功！');
      await refetch();
      setShowBankModal(false);
      setBankAmount('');
    } catch (err) {
      toast.error('网络错误');
    }
  };

  const handleTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedStock) return;
    const shares = parseInt(tradeShares);
    if (isNaN(shares) || shares <= 0) return toast.error('请输入有效股数');

    try {
      await tradeMutation.mutateAsync({ action: tradeAction, stockId: selectedStock.id, shares });
      toast.success(tradeAction === 'buy' ? '买入成功！' : '卖出成功！');
      await refetch();
      setSelectedStock(null);
      setTradeShares('');
    } catch (err) {
      toast.error('网络错误');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" label="正在加载银行数据" />
      </div>
    );
  }

  const totalPortfolioValue = portfolio.reduce((sum, item) => sum + (item.shares * item.current_price), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <PageHeader title="王国储蓄银行" icon={Building2} />

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Bank Widget */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex-1 overflow-hidden rounded-panel border border-accent-foreground bg-gradient-to-br from-primary to-accent-foreground p-8 shadow-raised"
        >
          <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-10">
            <Building2 className="size-48 text-primary-foreground" />
          </div>

          <div className="relative z-10 mb-8">
            <div className="mb-1 flex items-center text-sm font-medium text-primary-foreground/70">
              <PiggyBank className="mr-2 size-4 text-warning" />
              当前存款余额
            </div>
            <div className="flex items-baseline text-5xl font-black text-primary-foreground">
              <Coins className="mr-2 size-8 text-warning" />
              {bank?.deposit_amount || 0}
            </div>
            <Badge
              variant="success"
              className="mt-3 h-auto border-success/40 bg-success/20 px-3 py-1 text-sm font-bold text-success-foreground"
            >
              <TrendingUp /> 日利率: {((bank?.interest_rate || 0.05) * 100).toFixed(1)}%
            </Badge>
          </div>

          <div className="relative z-10 flex gap-3">
            <Button
              onClick={() => { setBankAction('deposit'); setShowBankModal(true); }}
              className="h-auto flex-1 bg-paper py-3 font-bold text-primary hover:bg-paper/90"
            >
              存入积分
            </Button>
            <Button
              onClick={() => { setBankAction('withdraw'); setShowBankModal(true); }}
              className="h-auto flex-1 border border-primary-foreground/40 bg-primary-foreground/10 py-3 font-bold text-primary-foreground hover:bg-primary-foreground/20"
            >
              提取积分
            </Button>
          </div>
        </motion.div>

        {/* Portfolio Summary */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative flex-1 overflow-hidden rounded-panel border border-border bg-paper/80 p-8 shadow-card backdrop-blur-xl"
        >
          <h3 className="mb-6 flex items-center text-2xl font-bold text-ink-1">
            <Briefcase className="mr-3 size-7 text-primary" />
            我的股票资产
          </h3>

          <div className="mb-8">
            <div className="mb-1 text-sm font-medium text-ink-3">总持仓市值 (积分)</div>
            <div className="text-5xl font-black tracking-tight text-ink-1">{totalPortfolioValue}</div>
          </div>

          <div className="space-y-3">
            {portfolio.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="暂无持仓，前往下方股市大厅买入股票"
                className="bg-transparent"
              />
            ) : (
              portfolio.map(p => {
                const profit = (p.current_price - p.average_buy_price) * p.shares;
                const isProfit = profit >= 0;
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-card border border-border bg-muted/50 p-4">
                    <div>
                      <div className="font-bold text-ink-1">
                        {p.name} <span className="ml-1 text-xs text-ink-3">{p.symbol}</span>
                      </div>
                      <div className="text-sm text-ink-3">{p.shares} 股 @ {p.average_buy_price.toFixed(1)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-ink-1">{p.shares * p.current_price}</div>
                      <div className={`flex items-center justify-end text-xs font-bold ${isProfit ? 'text-success' : 'text-destructive'}`}>
                        {isProfit ? '+' : ''}{profit.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>

      {/* Stock Market */}
      <SectionCard
        title={
          <span className="flex items-center text-lg">
            <TrendingUp className="mr-2 size-5 text-success" />
            王国股市交易大厅
          </span>
        }
        actions={
          <span className="flex items-center font-mono text-sm text-ink-3">
            <RefreshCw className="mr-2 size-4 animate-spin" />
            实时报价
          </span>
        }
      >
        <DataTable<StockDto>
          columns={[
            {
              key: 'name',
              header: '股票名称 / 代码',
              render: (s) => (
                <div>
                  <div className="text-lg font-bold text-ink-1">{s.name}</div>
                  <div className="font-mono text-xs text-ink-3">{s.symbol}</div>
                </div>
              ),
            },
            {
              key: 'price',
              header: '当前价格',
              render: (s) => {
                const points = parseTrend(s.trend_history);
                const isUp = points.length > 1 && points[points.length - 1] >= points[points.length - 2];
                const change = points.length > 1 ? points[points.length - 1] - points[points.length - 2] : 0;
                const changePercent = points.length > 1 ? (change / points[points.length - 2]) * 100 : 0;
                return (
                  <div>
                    <div className={`text-2xl font-black ${isUp ? 'text-success' : 'text-destructive'}`}>
                      {s.current_price}
                    </div>
                    <div className={`text-xs font-bold ${isUp ? 'text-success' : 'text-destructive'}`}>
                      {change > 0 ? '+' : ''}{change} ({changePercent.toFixed(1)}%)
                    </div>
                  </div>
                );
              },
            },
            {
              key: 'trend',
              header: '走势',
              render: (s) => <Sparkline history={s.trend_history} />,
            },
            {
              key: 'actions',
              header: <span className="sr-only">操作</span>,
              align: 'right',
              render: (s) => (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => { setSelectedStock(s); setTradeAction('buy'); setShowBankModal(false); }}
                    className="border border-success/30 bg-success/10 font-bold text-success hover:bg-success/20 hover:text-success"
                  >
                    买入
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setSelectedStock(s); setTradeAction('sell'); setShowBankModal(false); }}
                    className="border border-destructive/30 bg-destructive/10 font-bold text-destructive hover:bg-destructive/20 hover:text-destructive"
                  >
                    卖出
                  </Button>
                </div>
              ),
            },
          ]}
          rows={stocks}
          getRowKey={(s) => s.id}
          empty={
            <EmptyState
              icon={TrendingUp}
              title="市场休市中，暂无挂牌股票"
              className="bg-transparent"
            />
          }
        />
      </SectionCard>

      {/* Bank Dialog */}
      <Dialog open={showBankModal} onOpenChange={(open) => !open && setShowBankModal(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center text-xl font-bold text-ink-1">
              {bankAction === 'deposit' ? <TrendingUp className="mr-2 size-6 text-success" /> : <TrendingDown className="mr-2 size-6 text-warning" />}
              {bankAction === 'deposit' ? '存入积分' : '提取积分'}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-card border border-border bg-muted/50 p-4">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-ink-3">钱包可用积分:</span>
              <span className="font-bold text-ink-1">{user?.available_points}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-3">银行当前存款:</span>
              <span className="font-bold text-ink-1">{bank?.deposit_amount || 0}</span>
            </div>
          </div>

          <form onSubmit={handleBankSubmit} className="space-y-4">
            <FormField label={`输入${bankAction === 'deposit' ? '存入' : '提取'}金额`}>
              <Input
                autoFocus
                type="number"
                min="1"
                required
                value={bankAmount}
                onChange={e => setBankAmount(e.target.value)}
                className="h-auto px-4 py-2.5 text-lg font-bold md:text-lg"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowBankModal(false)}>
                取消
              </Button>
              <Button type="submit">确认</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Trade Dialog */}
      <Dialog open={Boolean(selectedStock)} onOpenChange={(open) => !open && setSelectedStock(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center text-xl font-bold text-ink-1">
              {tradeAction === 'buy' ? '买入股票' : '卖出股票'}
              <span className="ml-2 rounded-card bg-muted/50 px-2 py-1 text-sm text-ink-2">{selectedStock?.symbol}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-card border border-border bg-muted/50 p-4">
            <div className="mb-2 flex justify-between border-b border-border pb-2 text-sm">
              <span className="text-ink-3">当前单价:</span>
              <span className="font-bold text-warning">{selectedStock?.current_price} 积分</span>
            </div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-ink-3">我的可用积分:</span>
              <span className="font-bold text-ink-1">{user?.available_points}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-3">我的当前持仓:</span>
              <span className="font-bold text-ink-1">{portfolio.find(p => p.stock_id === selectedStock?.id)?.shares || 0} 股</span>
            </div>
          </div>

          <form onSubmit={handleTradeSubmit} className="space-y-4">
            <FormField label={`输入${tradeAction === 'buy' ? '买入' : '卖出'}股数`}>
              <Input
                autoFocus
                type="number"
                min="1"
                required
                value={tradeShares}
                onChange={e => setTradeShares(e.target.value)}
                className="h-auto px-4 py-2.5 text-lg font-bold md:text-lg"
              />
            </FormField>

            {tradeShares && !isNaN(parseInt(tradeShares)) && (
              <div className="text-center text-sm text-ink-3">
                预计交易总额: <span className="font-bold text-ink-1">{parseInt(tradeShares) * (selectedStock?.current_price ?? 0)} 积分</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSelectedStock(null)}>
                取消
              </Button>
              <Button type="submit" variant={tradeAction === 'buy' ? 'default' : 'destructive'}>
                确认{tradeAction === 'buy' ? '买入' : '卖出'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
