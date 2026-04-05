import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { ShoppingCart, Check, Star, Package, Gift, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

interface ShopItem {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
}

interface BlindBox {
  id: number;
  name: string;
  description: string;
  price: number;
  is_active: number;
}

export default function StudentShop() {
  const user = useStore((state) => state.user);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [blindBoxes, setBlindBoxes] = useState<BlindBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [activeTab, setActiveTab] = useState<'normal' | 'blindbox'>('normal');
  const [unboxingResult, setUnboxingResult] = useState<{show: boolean, reward: string, isConsolation: boolean}>({ show: false, reward: '', isConsolation: false });
  const [isUnboxing, setIsUnboxing] = useState(false);

  const fetchData = async () => {
    if (!user?.studentId) return;
    try {
      const [resItems, resBoxes, resStudents] = await Promise.all([
        fetch('/api/shop/items'),
        fetch('/api/shop/blind_boxes'),
        fetch('/api/students')
      ]);
      
      const dataItems = await resItems.json();
      const dataBoxes = await resBoxes.json();
      const dataStudents = await resStudents.json();

      if (dataItems.success) setItems(dataItems.items);
      if (dataBoxes.success) setBlindBoxes(dataBoxes.boxes.filter((b: any) => b.is_active === 1));
      
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
  }, [user]);

  const handleBuy = async (itemId: number) => {
    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user?.studentId, itemId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('兑换成功！已放入背包或生效');
        fetchData();
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    }
  };

  const handleBuyBlindBox = async (boxId: number) => {
    try {
      setIsUnboxing(true);
      const res = await fetch('/api/shop/blind_box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user?.studentId, blindBoxId: boxId }),
      });
      const data = await res.json();
      
      if (data.success) {
        // Wait for unboxing animation
        setTimeout(() => {
          setIsUnboxing(false);
          setUnboxingResult({ 
            show: true, 
            reward: data.reward,
            isConsolation: data.reward.includes('安慰奖')
          });
          if (!data.reward.includes('安慰奖')) {
            confetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.6 },
              colors: ['#a855f7', '#ec4899', '#eab308']
            });
          }
          fetchData();
        }, 2000);
      } else {
        setIsUnboxing(false);
        toast.error(data.message);
      }
    } catch (err) {
      console.error(err);
      setIsUnboxing(false);
      toast.error('网络错误');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl mx-auto space-y-8"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white rounded-[2rem] p-10 shadow-xl border-b-8 border-orange-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-yellow-400 opacity-10 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-yellow-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 mb-6 md:mb-0 text-center md:text-left">
          <h2 className="text-5xl font-black text-gray-900 mb-4 drop-shadow-sm flex items-center justify-center md:justify-start">
            <ShoppingCart className="h-12 w-12 mr-4 text-orange-500" />
            积分兑换商城
          </h2>
          <p className="text-xl text-gray-600 font-bold">用你的努力换取超值奖励！</p>
        </div>
        
        <motion.div 
          whileHover={{ scale: 1.05, rotate: 2 }}
          className="relative z-10 flex items-center bg-white p-6 rounded-[2rem] shadow-2xl border-b-8 border-r-4 border-l-4 border-t-4 border-orange-300"
        >
          <div className="bg-orange-100 p-4 rounded-full mr-5 shadow-inner">
            <Star className="h-10 w-10 text-orange-500 fill-current" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">我的余额</p>
            <p className="text-4xl font-black text-orange-600 leading-none">
              {availablePoints} <span className="text-xl font-bold">币</span>
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Tabs */}
      <div className="flex justify-center space-x-4 mb-8">
        <button 
          onClick={() => setActiveTab('normal')} 
          className={`px-8 py-3 rounded-2xl font-black text-lg transition-all shadow-sm border-b-4 ${
            activeTab === 'normal' 
              ? 'bg-orange-500 text-white border-orange-700' 
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          常规商品
        </button>
        <button 
          onClick={() => setActiveTab('blindbox')} 
          className={`px-8 py-3 rounded-2xl font-black text-lg transition-all shadow-sm border-b-4 flex items-center ${
            activeTab === 'blindbox' 
              ? 'bg-purple-600 text-white border-purple-800' 
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Gift className="w-5 h-5 mr-2" />
          神秘盲盒
        </button>
      </div>

      {/* Item Grid */}
      {loading ? (
        <div className="text-center py-20 font-black text-2xl text-gray-400 animate-pulse">加载中...</div>
      ) : activeTab === 'normal' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {items.map((item, index) => {
            const isOutOfStock = item.stock === 0;
            const canAfford = availablePoints >= item.price && !isOutOfStock;
            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={item.id} 
                whileHover={canAfford ? { scale: 1.05, y: -10 } : {}}
                className={`bg-white rounded-[2rem] shadow-lg border-b-8 border-r-4 border-l-4 border-t-4 overflow-hidden transition-all flex flex-col ${
                  canAfford 
                    ? 'border-orange-200 hover:border-orange-400 hover:shadow-2xl' 
                    : 'border-gray-200 opacity-80 grayscale-[0.5]'
                }`}
              >
                {/* Image Placeholder */}
                <div className="h-48 bg-gradient-to-br from-orange-100 to-yellow-50 flex items-center justify-center p-6 relative border-b-4 border-orange-100">
                  <div className={`absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-black shadow-md border-2 border-white ${isOutOfStock ? 'text-red-500' : 'text-gray-700'}`}>
                    库存: {item.stock === -1 ? '无限' : item.stock}
                  </div>
                  <ShoppingCart className={`h-20 w-20 ${canAfford ? 'text-orange-400 drop-shadow-md' : 'text-gray-300'} transition-transform duration-300 group-hover:scale-110`} />
                </div>
                
                <div className="p-6 flex-1 flex flex-col bg-white">
                  <h3 className="text-2xl font-black text-gray-900 mb-3">{item.name}</h3>
                  <p className="text-base text-gray-600 mb-6 flex-1 leading-relaxed font-medium">{item.description}</p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t-4 border-gray-50 border-dashed">
                    <div className="flex items-baseline">
                      <span className={`text-4xl font-black ${canAfford ? 'text-orange-500 drop-shadow-sm' : 'text-gray-400'}`}>{item.price}</span>
                      <span className="text-lg text-gray-500 ml-1 font-bold">币</span>
                    </div>
                    <motion.button
                      whileTap={canAfford ? { scale: 0.95 } : {}}
                      onClick={() => handleBuy(item.id)}
                      disabled={!canAfford}
                      className={`px-6 py-3 rounded-2xl font-black text-lg transition-all shadow-md border-b-4 ${
                        canAfford 
                          ? 'bg-orange-500 text-white border-orange-700 hover:bg-orange-400 hover:shadow-lg' 
                          : 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'
                      }`}
                    >
                      {isOutOfStock ? '已售罄' : canAfford ? '立即兑换' : '积分不足'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {items.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-32 text-center bg-white rounded-[3rem] border-8 border-dashed border-gray-200 shadow-sm"
            >
              <div className="inline-flex items-center justify-center p-8 bg-gray-100 rounded-full mb-6 shadow-inner">
                <Check className="h-16 w-16 text-gray-400" />
              </div>
              <p className="text-3xl font-black text-gray-500">商城暂时没有商品</p>
              <p className="text-xl font-bold text-gray-400 mt-4">请等待老师上架新物品哦</p>
            </motion.div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {blindBoxes.map((box, index) => {
            const canAfford = availablePoints >= box.price;
            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={box.id} 
                whileHover={canAfford && !isUnboxing ? { scale: 1.05, y: -10 } : {}}
                className={`bg-white rounded-[2rem] shadow-lg border-b-8 border-r-4 border-l-4 border-t-4 overflow-hidden transition-all flex flex-col ${
                  canAfford && !isUnboxing
                    ? 'border-purple-200 hover:border-purple-400 hover:shadow-2xl hover:shadow-purple-500/20' 
                    : 'border-gray-200 opacity-80 grayscale-[0.5]'
                }`}
              >
                <div className="h-48 bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center p-6 relative border-b-4 border-purple-800 overflow-hidden group">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  >
                    <Package className={`h-24 w-24 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-transform duration-300 group-hover:scale-110`} />
                  </motion.div>
                  <Sparkles className="absolute top-6 right-6 h-8 w-8 text-yellow-300 animate-pulse" />
                  <Sparkles className="absolute bottom-6 left-6 h-6 w-6 text-pink-300 animate-pulse" style={{ animationDelay: '1s' }} />
                </div>
                
                <div className="p-6 flex-1 flex flex-col bg-white relative">
                  <h3 className="text-2xl font-black text-purple-900 mb-3">{box.name}</h3>
                  <p className="text-base text-gray-600 mb-6 flex-1 leading-relaxed font-medium">{box.description}</p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t-4 border-purple-50 border-dashed">
                    <div className="flex items-baseline">
                      <span className={`text-4xl font-black ${canAfford ? 'text-purple-600 drop-shadow-sm' : 'text-gray-400'}`}>{box.price}</span>
                      <span className="text-lg text-gray-500 ml-1 font-bold">币</span>
                    </div>
                    <motion.button
                      whileTap={canAfford && !isUnboxing ? { scale: 0.95 } : {}}
                      onClick={() => handleBuyBlindBox(box.id)}
                      disabled={!canAfford || isUnboxing}
                      className={`px-6 py-3 rounded-2xl font-black text-lg transition-all shadow-md border-b-4 ${
                        canAfford && !isUnboxing
                          ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-purple-800 hover:from-purple-400 hover:to-indigo-500 hover:shadow-lg hover:shadow-purple-500/30' 
                          : 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'
                      }`}
                    >
                      {canAfford ? '开启盲盒' : '积分不足'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {blindBoxes.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full py-32 text-center bg-white rounded-[3rem] border-8 border-dashed border-purple-100 shadow-sm"
            >
              <div className="inline-flex items-center justify-center p-8 bg-purple-50 rounded-full mb-6 shadow-inner">
                <Package className="h-16 w-16 text-purple-300" />
              </div>
              <p className="text-3xl font-black text-gray-500">暂无盲盒上架</p>
              <p className="text-xl font-bold text-gray-400 mt-4">请等待老师准备神秘惊喜哦</p>
            </motion.div>
          )}
        </div>
      )}

      {/* Unboxing Modal Overlay */}
      <AnimatePresence>
        {isUnboxing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, -10, 10, -10, 10, 0],
                y: [0, -20, 0]
              }}
              transition={{ 
                duration: 0.5, 
                repeat: Infinity,
                repeatType: "reverse"
              }}
              className="relative"
            >
              <div className="absolute inset-0 bg-purple-500 blur-3xl opacity-50 rounded-full"></div>
              <Package className="w-48 h-48 text-white drop-shadow-[0_0_30px_rgba(168,85,247,0.8)] relative z-10" />
            </motion.div>
          </motion.div>
        )}

        {unboxingResult.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.5, y: 100, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className={`bg-white rounded-[3rem] max-w-lg w-full p-10 text-center shadow-2xl border-8 ${unboxingResult.isConsolation ? 'border-gray-200' : 'border-yellow-400'}`}
            >
              <div className={`mx-auto w-32 h-32 rounded-full flex items-center justify-center mb-8 shadow-inner ${unboxingResult.isConsolation ? 'bg-gray-100' : 'bg-yellow-100'}`}>
                {unboxingResult.isConsolation ? (
                  <Gift className="w-16 h-16 text-gray-400" />
                ) : (
                  <Zap className="w-16 h-16 text-yellow-500 fill-yellow-500" />
                )}
              </div>
              <h3 className="text-3xl font-black text-gray-900 mb-4">
                {unboxingResult.isConsolation ? '再接再厉' : '恭喜你！'}
              </h3>
              <p className={`text-2xl font-bold mb-10 ${unboxingResult.isConsolation ? 'text-gray-500' : 'text-purple-600'}`}>
                {unboxingResult.reward}
              </p>
              <button
                onClick={() => setUnboxingResult({ show: false, reward: '', isConsolation: false })}
                className="w-full py-4 rounded-2xl font-black text-xl bg-gray-900 text-white hover:bg-gray-800 transition-colors shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                收下奖励
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
