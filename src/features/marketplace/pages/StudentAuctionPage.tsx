import { useState, useEffect } from 'react';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Gavel, Clock, Coins, Flame, AlertCircle, ArrowUpRight, SearchX, Zap, CheckCircle2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { motion, useReducedMotion } from 'framer-motion';

import { shopApi, type Auction } from '@/features/marketplace/api/shopApi';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { launchConfetti } from '@/lib/confetti';

export default function StudentAuction() {
  const user = useStore((state) => state.user);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [bidAmount, setBidAmount] = useState<Record<number, number>>({});
  const [bidding, setBidding] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const fetchData = async () => {
    if (!user?.studentId) return;
    try {
      const [dataAuctions, dataStudents] = await Promise.all([
          shopApi.getAuctions(),
          studentsApi.getStudents()
        ]);

      if (dataAuctions.success) {
        setAuctions(dataAuctions.auctions.filter((a: Auction) => a.status === 'active' && new Date(a.end_time) > new Date()));
      }

      if (dataStudents.success) {
        const student = dataStudents.students.find((s: any) => s.id === user.studentId);
        if (student) setAvailablePoints(student.available_points);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto refresh every 10 seconds to keep prices updated
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleBidChange = (id: number, value: number) => {
    setBidAmount(prev => ({ ...prev, [id]: value }));
  };

  const handleBid = async (auction: Auction) => {
    const amount = bidAmount[auction.id] || auction.current_price + 10;

    if (amount <= auction.current_price) {
      toast.error('出价必须高于当前最高价！');
      return;
    }
    if (amount > availablePoints) {
      toast.error('你的积分余额不足！');
      return;
    }

    setBidding(auction.id);
    try {
      const data = await shopApi.bidAuction(auction.id, { studentId: user!.studentId!, bid_amount: amount });

      if (data.success) {
        toast.success(`成功出价 ${amount} 积分！`);
        void launchConfetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: [...CELEBRATION.brand]
        });
        fetchData();
        setBidAmount(prev => ({ ...prev, [auction.id]: 0 }));
      } else {
        toast.error(data.message || '出价失败，可能已经被别人抢先出价了');
        fetchData(); // refresh to get new price
      }
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    } finally {
      setBidding(null);
    }
  };

  // Calculate remaining time
  const getTimeRemaining = (endTime: string) => {
    const total = Date.parse(endTime) - Date.parse(new Date().toString());
    if (total <= 0) return '已结束';
    const hours = Math.floor((total / (1000 * 60 * 60)));
    const minutes = Math.floor((total / 1000 / 60) % 60);
    return `${hours}小时 ${minutes}分钟`;
  };

  return (
    <PageScaffold variant="dashboard">
      <div className="space-y-8">
        {/* Header Banner */}
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: -20 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
          className="relative overflow-hidden rounded-panel bg-gradient-to-r from-warning to-danger p-10 text-fg-inverse shadow-raised"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
          <div className="absolute -right-24 -top-24 h-64 w-64 animate-pulse rounded-full bg-warning mix-blend-screen opacity-50 blur-[80px]"></div>

          <div className="relative z-10 flex flex-col items-center justify-between md:flex-row">
            <div className="mb-6 text-center md:mb-0 md:text-left">
              <h2 className="mb-3 flex items-center justify-center text-4xl font-black drop-shadow-md md:justify-start">
                <Gavel className="mr-4 h-10 w-10" />
                跳蚤市场 & 拍卖行
              </h2>
              <p className="flex items-center justify-center text-lg font-medium text-fg-inverse/85 md:justify-start">
                <Flame className="mr-2 h-5 w-5 text-fg-inverse" />
                全班竞价，价高者得！被超越会自动全额退款。
              </p>
            </div>
            <div className="rounded-panel border border-fg-inverse/30 bg-surface-2/20 px-8 py-4 text-center shadow-inset backdrop-blur-md">
              <div className="mb-1 text-sm font-bold text-fg-inverse/85">你的可用积分</div>
              <div className="flex items-center justify-center text-4xl font-black text-fg-inverse drop-shadow-sm">
                <Coins className="mr-2 h-8 w-8" />
                {availablePoints}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Grid */}
        {loading ? (
          <div className="flex flex-col items-center py-20 text-center text-2xl font-black text-fg-3 animate-pulse">
            <Gavel className="mb-4 h-12 w-12 animate-bounce" />
            正在搜寻稀有拍品...
          </div>
        ) : auctions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.95 }) }}
            animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
            className="rounded-panel border-8 border-dashed border-warning/20 bg-surface-2 py-32 text-center shadow-card"
          >
            <div className="mb-6 inline-flex items-center justify-center rounded-full bg-warning/10 p-8 shadow-inset">
              <SearchX className="h-16 w-16 text-warning" />
            </div>
            <p className="mb-2 text-3xl font-black text-fg-3">当前没有正在进行的拍卖</p>
            <p className="text-xl font-bold text-fg-3">请等待老师发布稀有物品，或者去积分商城看看吧！</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
            {auctions.map((auction, index) => {
              const isHighestBidder = auction.highest_bidder_id === user?.studentId;
              const minBid = auction.current_price + 10;
              const currentBidInput = bidAmount[auction.id] || minBid;
              const canAfford = availablePoints >= currentBidInput;
              const isClosingSoon = Date.parse(auction.end_time) - Date.parse(new Date().toString()) < 3600000; // Less than 1 hour

              return (
                <motion.div
                  initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 20 }) }}
                  animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                  transition={{ delay: index * 0.1 }}
                  key={auction.id}
                  className={`flex flex-col overflow-hidden rounded-panel bg-surface-2 shadow-raised transition-all border-4 ${
                    isHighestBidder ? 'border-success shadow-success/20' : 'border-warning/20 hover:border-warning/60'
                  }`}
                >
                  {/* Card Header / Image Area */}
                  <div className={`relative flex h-40 flex-col justify-between p-6 ${
                    isHighestBidder ? 'bg-gradient-to-br from-success-soft to-success-soft' : 'bg-gradient-to-br from-warning-soft to-danger-soft'
                  }`}>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-noise.png')] opacity-30"></div>

                    <div className="relative z-10 flex items-start justify-between">
                      <div className={`flex items-center rounded-card px-3 py-1.5 text-xs font-black shadow-card ${
                        isHighestBidder ? 'bg-success text-fg-inverse' : isClosingSoon ? 'bg-danger text-fg-inverse animate-pulse' : 'bg-warning text-fg-inverse'
                      }`}>
                        <Clock className="mr-1 h-4 w-4" />
                        {getTimeRemaining(auction.end_time)}
                      </div>
                      {isHighestBidder && (
                        <div className="flex items-center rounded-card border border-success/40 bg-success/20 px-3 py-1.5 text-xs font-black text-success shadow-card">
                          <CheckCircle2 className="mr-1 h-4 w-4" /> 你目前领先
                        </div>
                      )}
                    </div>

                    <h3 className="relative z-10 mt-4 truncate text-2xl font-black text-fg-1 drop-shadow-sm">
                      {auction.item_name}
                    </h3>
                  </div>

                  {/* Card Body */}
                  <div className="flex flex-1 flex-col bg-surface-2 p-6">
                    <p className="mb-6 line-clamp-3 flex-1 font-medium text-fg-2">
                      {auction.description}
                    </p>

                    <div className="space-y-4">
                      <div className="flex items-end justify-between rounded-card border border-line-1 bg-surface-3/50 p-4">
                        <div>
                          <div className="mb-1 text-xs font-bold text-fg-3">当前最高价</div>
                          <div className={`flex items-baseline text-3xl font-black ${isHighestBidder ? 'text-success' : 'text-warning'}`}>
                            <Coins className="mr-1.5 h-6 w-6" />
                            {auction.current_price}
                            <span className="ml-1 text-sm font-bold text-fg-3">分</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="mb-1 text-xs font-bold text-fg-3">起拍价</div>
                          <div className="text-sm font-bold text-fg-3">{auction.starting_price} 分</div>
                        </div>
                      </div>

                      {/* Bidding Area */}
                      {!isHighestBidder && (
                        <div className="pt-2">
                          <div className="mb-3 flex items-center space-x-3">
                            <div className="relative flex-1">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-fg-3">出价</span>
                              <Input
                                type="number"
                                min={minBid}
                                step="10"
                                value={currentBidInput}
                                onChange={(e) => handleBidChange(auction.id, Number(e.target.value))}
                                className="w-full rounded-card border-2 border-line-1 bg-surface-3/50 py-3 pl-16 pr-4 text-xl font-black text-warning outline-none transition-all focus:border-warning focus:bg-surface-2"
                              />
                            </div>
                            <Button variant="ghost"
                              onClick={() => handleBidChange(auction.id, currentBidInput + 50)}
                              className="rounded-card border border-warning/40 bg-warning/20 px-4 py-3 font-black text-warning transition-colors hover:bg-warning/30"
                            >
                              +50
                            </Button>
                          </div>

                          <Button variant="ghost"
                            onClick={() => handleBid(auction)}
                            disabled={bidding === auction.id || !canAfford}
                            className={`flex w-full items-center justify-center rounded-card py-4 text-lg font-black transition-all shadow-md ${
                              canAfford
                                ? 'bg-gradient-to-r from-warning to-danger text-fg-inverse hover:-translate-y-1 hover:shadow-raised'
                                : 'cursor-not-allowed bg-surface-3 text-fg-3'
                            }`}
                          >
                            {bidding === auction.id ? (
                              <Zap className="h-6 w-6 animate-pulse" />
                            ) : !canAfford ? (
                              '积分不足'
                            ) : (
                              <>
                                <ArrowUpRight className="mr-2 h-6 w-6" />
                                参与竞拍
                              </>
                            )}
                          </Button>
                          {!canAfford && (
                            <p className="mt-2 flex items-center justify-center text-center text-xs font-bold text-danger">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              你的余额不足以出价 {currentBidInput} 积分
                            </p>
                          )}
                        </div>
                      )}

                      {isHighestBidder && (
                        <div className="pt-2">
                          <div className="flex w-full items-center justify-center rounded-card border-2 border-success/30 bg-success/10 py-4 text-lg font-black text-success">
                            <Crown className="mr-2 h-6 w-6" />
                            你目前是最高出价者！稳住！
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageScaffold>
  );
}
