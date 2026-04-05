import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Gavel, Clock, Coins, Flame, AlertCircle, ArrowUpRight, SearchX, Zap, CheckCircle2, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

interface Auction {
  id: number;
  item_name: string;
  description: string;
  starting_price: number;
  current_price: number;
  highest_bidder_id: number | null;
  status: 'active' | 'ended';
  end_time: string;
}

export default function StudentAuction() {
  const user = useStore((state) => state.user);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [bidAmount, setBidAmount] = useState<Record<number, number>>({});
  const [bidding, setBidding] = useState<number | null>(null);

  const fetchData = async () => {
    if (!user?.studentId) return;
    try {
      const [resAuctions, resStudents] = await Promise.all([
        fetch('/api/shop/auctions'),
        fetch('/api/students')
      ]);
      
      const dataAuctions = await resAuctions.json();
      const dataStudents = await resStudents.json();

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
      const res = await fetch(`/api/shop/auctions/${auction.id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user?.studentId, bid_amount: amount }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success(`成功出价 ${amount} 积分！`);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#f59e0b', '#ef4444']
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-orange-500 to-red-500 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden text-white"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-yellow-400 rounded-full mix-blend-screen filter blur-[80px] opacity-50 animate-pulse"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between">
          <div className="text-center md:text-left mb-6 md:mb-0">
            <h2 className="text-4xl font-black mb-3 flex items-center justify-center md:justify-start drop-shadow-md">
              <Gavel className="h-10 w-10 mr-4" />
              跳蚤市场 & 拍卖行
            </h2>
            <p className="text-lg text-orange-100 font-medium flex items-center justify-center md:justify-start">
              <Flame className="w-5 h-5 mr-2 text-yellow-300" />
              全班竞价，价高者得！被超越会自动全额退款。
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-md px-8 py-4 rounded-3xl border border-white/30 text-center shadow-inner">
            <div className="text-sm font-bold mb-1 text-orange-100">你的可用积分</div>
            <div className="text-4xl font-black flex items-center justify-center text-yellow-300 drop-shadow-sm">
              <Coins className="w-8 h-8 mr-2" />
              {availablePoints}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20 font-black text-2xl text-slate-400 animate-pulse flex flex-col items-center">
          <Gavel className="w-12 h-12 mb-4 animate-bounce" />
          正在搜寻稀有拍品...
        </div>
      ) : auctions.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-32 bg-white rounded-[3rem] border-8 border-dashed border-orange-100 shadow-sm"
        >
          <div className="inline-flex items-center justify-center p-8 bg-orange-50 rounded-full mb-6 shadow-inner">
            <SearchX className="h-16 w-16 text-orange-300" />
          </div>
          <p className="text-3xl font-black text-slate-500 mb-2">当前没有正在进行的拍卖</p>
          <p className="text-xl font-bold text-slate-400">请等待老师发布稀有物品，或者去积分商城看看吧！</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {auctions.map((auction, index) => {
            const isHighestBidder = auction.highest_bidder_id === user?.studentId;
            const minBid = auction.current_price + 10;
            const currentBidInput = bidAmount[auction.id] || minBid;
            const canAfford = availablePoints >= currentBidInput;
            const isClosingSoon = Date.parse(auction.end_time) - Date.parse(new Date().toString()) < 3600000; // Less than 1 hour

            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={auction.id}
                className={`bg-white rounded-[2rem] shadow-xl overflow-hidden transition-all flex flex-col border-4 ${
                  isHighestBidder ? 'border-green-400 shadow-green-500/20' : 'border-orange-100 hover:border-orange-300'
                }`}
              >
                {/* Card Header / Image Area */}
                <div className={`h-40 p-6 relative flex flex-col justify-between ${
                  isHighestBidder ? 'bg-gradient-to-br from-green-50 to-emerald-100' : 'bg-gradient-to-br from-orange-50 to-red-50'
                }`}>
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-noise.png')] opacity-30"></div>
                  
                  <div className="flex justify-between items-start relative z-10">
                    <div className={`px-3 py-1.5 rounded-xl text-xs font-black shadow-sm flex items-center ${
                      isHighestBidder ? 'bg-green-500 text-white' : isClosingSoon ? 'bg-red-500 text-white animate-pulse' : 'bg-orange-500 text-white'
                    }`}>
                      <Clock className="w-4 h-4 mr-1" />
                      {getTimeRemaining(auction.end_time)}
                    </div>
                    {isHighestBidder && (
                      <div className="px-3 py-1.5 bg-green-100 text-green-700 border border-green-300 rounded-xl text-xs font-black flex items-center shadow-sm">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> 你目前领先
                      </div>
                    )}
                  </div>

                  <h3 className="text-2xl font-black text-slate-800 relative z-10 truncate drop-shadow-sm mt-4">
                    {auction.item_name}
                  </h3>
                </div>

                {/* Card Body */}
                <div className="p-6 flex-1 flex flex-col bg-white">
                  <p className="text-slate-600 font-medium mb-6 flex-1 line-clamp-3">
                    {auction.description}
                  </p>

                  <div className="space-y-4">
                    <div className="flex justify-between items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div>
                        <div className="text-xs font-bold text-slate-400 mb-1">当前最高价</div>
                        <div className={`text-3xl font-black flex items-baseline ${isHighestBidder ? 'text-green-500' : 'text-orange-500'}`}>
                          <Coins className="w-6 h-6 mr-1.5" />
                          {auction.current_price}
                          <span className="text-sm font-bold text-slate-400 ml-1">分</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 mb-1">起拍价</div>
                        <div className="text-sm font-bold text-slate-500">{auction.starting_price} 分</div>
                      </div>
                    </div>

                    {/* Bidding Area */}
                    {!isHighestBidder && (
                      <div className="pt-2">
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">出价</span>
                            <input 
                              type="number" 
                              min={minBid}
                              step="10"
                              value={currentBidInput}
                              onChange={(e) => handleBidChange(auction.id, Number(e.target.value))}
                              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-3 pl-16 pr-4 font-black text-xl text-orange-600 outline-none focus:border-orange-400 focus:bg-white transition-all"
                            />
                          </div>
                          <button
                            onClick={() => handleBidChange(auction.id, currentBidInput + 50)}
                            className="px-4 py-3 bg-orange-100 text-orange-600 hover:bg-orange-200 font-black rounded-xl transition-colors border border-orange-200"
                          >
                            +50
                          </button>
                        </div>
                        
                        <button
                          onClick={() => handleBid(auction)}
                          disabled={bidding === auction.id || !canAfford}
                          className={`w-full py-4 rounded-2xl font-black text-lg transition-all shadow-md flex items-center justify-center ${
                            canAfford 
                              ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg hover:-translate-y-1 hover:shadow-orange-500/30' 
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {bidding === auction.id ? (
                            <Zap className="w-6 h-6 animate-pulse" />
                          ) : !canAfford ? (
                            '积分不足'
                          ) : (
                            <>
                              <ArrowUpRight className="w-6 h-6 mr-2" />
                              参与竞拍
                            </>
                          )}
                        </button>
                        {!canAfford && (
                          <p className="text-center text-xs text-red-400 mt-2 font-bold flex items-center justify-center">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            你的余额不足以出价 {currentBidInput} 积分
                          </p>
                        )}
                      </div>
                    )}

                    {isHighestBidder && (
                      <div className="pt-2">
                        <div className="w-full py-4 rounded-2xl font-black text-lg bg-green-50 text-green-600 border-2 border-green-200 flex items-center justify-center">
                          <Crown className="w-6 h-6 mr-2" />
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
  );
}