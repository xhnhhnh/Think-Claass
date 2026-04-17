import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Building2, TrendingUp, TrendingDown, RefreshCw, Wallet, PiggyBank, Briefcase, Coins, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useEconomyBankMutation, useEconomyData, useEconomyTradeMutation } from '@/hooks/queries/useEconomy';

interface BankAccount {
  student_id: number;
  deposit_amount: number;
  interest_rate: number;
  last_interest_date: string | null;
}

interface Stock {
  id: number;
  class_id: number;
  name: string;
  symbol: string;
  current_price: number;
  trend_history: string;
}

interface Portfolio {
  id: number;
  stock_id: number;
  student_id: number;
  shares: number;
  average_buy_price: number;
  name: string;
  symbol: string;
  current_price: number;
}

export default function StudentEconomy() {
  const user = useStore(state => state.user);
  const studentId = user?.studentId ?? user?.id ?? null;
  const classId = user?.class_id ?? null;
  const { data, isLoading: loading, refetch } = useEconomyData(studentId, classId);
  const bank = (data?.bank ?? null) as BankAccount | null;
  const stocks = (data?.stocks ?? []) as Stock[];
  const portfolio = (data?.portfolio ?? []) as Portfolio[];
  const bankMutation = useEconomyBankMutation(studentId);
  const tradeMutation = useEconomyTradeMutation(studentId);

  // Modals
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankAction, setBankAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [bankAmount, setBankAmount] = useState('');

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
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

  // Sparkline Chart Component
  const Sparkline = ({ history }: { history: string }) => {
    try {
      const points = JSON.parse(history) as number[];
      if (points.length < 2) return <div className="h-10 flex items-center text-slate-400 text-xs">无数据</div>;
      
      const max = Math.max(...points);
      const min = Math.min(...points);
      const range = max - min || 1;
      const step = 100 / (points.length - 1);
      
      const path = points.map((p, i) => `${i * step},${100 - ((p - min) / range) * 100}`).join(' L');
      const isUp = points[points.length - 1] >= points[points.length - 2];
      
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-24 h-12 overflow-visible">
          <path
            d={`M 0,${100 - ((points[0] - min) / range) * 100} L ${path}`}
            fill="none"
            stroke={isUp ? '#10b981' : '#f43f5e'}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    } catch {
      return null;
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" /></div>;

  const totalPortfolioValue = portfolio.reduce((sum, item) => sum + (item.shares * item.current_price), 0);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Bank Widget */}
        <div className="flex-1 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 shadow-2xl border border-indigo-500/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Building2 className="w-48 h-48 text-indigo-100" />
          </div>
          
          <h2 className="text-2xl font-bold text-white flex items-center mb-6 relative z-10">
            <PiggyBank className="w-7 h-7 mr-3 text-amber-400" />
            王国储蓄银行
          </h2>
          
          <div className="mb-8 relative z-10">
            <div className="text-indigo-200 text-sm font-medium mb-1">当前存款余额</div>
            <div className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] flex items-baseline">
              <Coins className="w-8 h-8 mr-2 text-amber-400" />
              {bank?.deposit_amount || 0}
            </div>
            <div className="mt-3 inline-flex items-center px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-300 text-sm font-bold">
              <TrendingUp className="w-4 h-4 mr-1" /> 日利率: {((bank?.interest_rate || 0.05) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="flex gap-3 relative z-10">
            <button 
              onClick={() => { setBankAction('deposit'); setShowBankModal(true); }}
              className="flex-1 py-3 bg-white text-indigo-900 font-bold rounded-xl shadow-lg hover:bg-indigo-50 transition-colors"
            >
              存入积分
            </button>
            <button 
              onClick={() => { setBankAction('withdraw'); setShowBankModal(true); }}
              className="flex-1 py-3 bg-indigo-800 text-white font-bold border border-indigo-400/50 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              提取积分
            </button>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="flex-1 bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center mb-6">
            <Briefcase className="w-7 h-7 mr-3 text-indigo-500" />
            我的股票资产
          </h2>
          
          <div className="mb-8">
            <div className="text-slate-500 text-sm font-medium mb-1">总持仓市值 (积分)</div>
            <div className="text-5xl font-black text-slate-800 tracking-tight">
              {totalPortfolioValue}
            </div>
          </div>

          <div className="space-y-3">
            {portfolio.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                暂无持仓，前往下方股市大厅买入股票
              </div>
            ) : (
              portfolio.map(p => {
                const profit = (p.current_price - p.average_buy_price) * p.shares;
                const isProfit = profit >= 0;
                return (
                  <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <div className="font-bold text-slate-800">{p.name} <span className="text-xs text-slate-400 ml-1">{p.symbol}</span></div>
                      <div className="text-sm text-slate-500">{p.shares} 股 @ {p.average_buy_price.toFixed(1)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-800">{p.shares * p.current_price}</div>
                      <div className={`text-xs font-bold flex items-center justify-end ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isProfit ? '+' : ''}{profit.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Stock Market */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-800">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <TrendingUp className="w-7 h-7 mr-3 text-emerald-400" />
            王国股市交易大厅
          </h2>
          <span className="text-slate-400 text-sm font-mono flex items-center">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            实时报价
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400 text-sm border-b border-slate-800">
                <th className="pb-4 font-medium pl-4">股票名称 / 代码</th>
                <th className="pb-4 font-medium">当前价格</th>
                <th className="pb-4 font-medium">走势</th>
                <th className="pb-4 font-medium text-right pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stocks.map(s => {
                let history = [];
                try { history = JSON.parse(s.trend_history); } catch {}
                const isUp = history.length > 1 && history[history.length - 1] >= history[history.length - 2];
                const change = history.length > 1 ? history[history.length - 1] - history[history.length - 2] : 0;
                const changePercent = history.length > 1 ? (change / history[history.length - 2]) * 100 : 0;

                return (
                  <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 pl-4">
                      <div className="font-bold text-white text-lg">{s.name}</div>
                      <div className="text-slate-500 text-xs font-mono">{s.symbol}</div>
                    </td>
                    <td className="py-4">
                      <div className={`font-black text-2xl ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.current_price}
                      </div>
                      <div className={`text-xs font-bold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {change > 0 ? '+' : ''}{change} ({changePercent.toFixed(1)}%)
                      </div>
                    </td>
                    <td className="py-4">
                      <Sparkline history={s.trend_history} />
                    </td>
                    <td className="py-4 text-right pr-4">
                      <button
                        onClick={() => { setSelectedStock(s); setTradeAction('buy'); setShowBankModal(false); }}
                        className="px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg font-bold text-sm mr-2 transition-colors"
                      >
                        买入
                      </button>
                      <button
                        onClick={() => { setSelectedStock(s); setTradeAction('sell'); setShowBankModal(false); }}
                        className="px-4 py-2 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg font-bold text-sm transition-colors"
                      >
                        卖出
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {stocks.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              市场休市中，暂无挂牌股票
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Bank Modal */}
        {showBankModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl max-w-sm w-full border border-indigo-100"
            >
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
                {bankAction === 'deposit' ? <TrendingUp className="w-6 h-6 mr-2 text-emerald-500" /> : <TrendingDown className="w-6 h-6 mr-2 text-amber-500" />}
                {bankAction === 'deposit' ? '存入积分' : '提取积分'}
              </h3>
              
              <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">钱包可用积分:</span>
                  <span className="font-bold text-slate-800">{user?.available_points}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">银行当前存款:</span>
                  <span className="font-bold text-slate-800">{bank?.deposit_amount || 0}</span>
                </div>
              </div>

              <form onSubmit={handleBankSubmit}>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  输入{bankAction === 'deposit' ? '存入' : '提取'}金额
                </label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  required
                  value={bankAmount}
                  onChange={e => setBankAmount(e.target.value)}
                  className="w-full px-4 py-3 text-lg font-bold rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 mb-6"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowBankModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">取消</button>
                  <button type="submit" className="flex-1 py-3 bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-600 transition-colors">确认</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Trade Modal */}
        {selectedStock && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl max-w-sm w-full text-white"
            >
              <h3 className="text-xl font-bold mb-6 flex items-center">
                {tradeAction === 'buy' ? '买入股票' : '卖出股票'}
                <span className="ml-2 text-sm px-2 py-1 bg-slate-700 rounded-lg text-slate-300">{selectedStock.symbol}</span>
              </h3>
              
              <div className="bg-slate-900 p-4 rounded-xl mb-6 border border-slate-700">
                <div className="flex justify-between text-sm mb-2 pb-2 border-b border-slate-800">
                  <span className="text-slate-400">当前单价:</span>
                  <span className="font-bold text-amber-400">{selectedStock.current_price} 积分</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">我的可用积分:</span>
                  <span className="font-bold text-white">{user?.available_points}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">我的当前持仓:</span>
                  <span className="font-bold text-white">{portfolio.find(p => p.stock_id === selectedStock.id)?.shares || 0} 股</span>
                </div>
              </div>

              <form onSubmit={handleTradeSubmit}>
                <label className="block text-sm font-bold text-slate-300 mb-2">
                  输入{tradeAction === 'buy' ? '买入' : '卖出'}股数
                </label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  required
                  value={tradeShares}
                  onChange={e => setTradeShares(e.target.value)}
                  className="w-full px-4 py-3 text-lg font-bold rounded-xl border border-slate-600 bg-slate-900 focus:ring-2 focus:ring-indigo-500 mb-4 text-white"
                />
                
                {tradeShares && !isNaN(parseInt(tradeShares)) && (
                  <div className="text-center text-sm mb-6 text-slate-400">
                    预计交易总额: <span className="font-bold text-white">{parseInt(tradeShares) * selectedStock.current_price} 积分</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setSelectedStock(null)} className="flex-1 py-3 bg-slate-700 text-slate-300 font-bold rounded-xl hover:bg-slate-600 transition-colors">取消</button>
                  <button 
                    type="submit" 
                    className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition-colors ${
                      tradeAction === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/50'
                    }`}
                  >
                    确认{tradeAction === 'buy' ? '买入' : '卖出'}
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
