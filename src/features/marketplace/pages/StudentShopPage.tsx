import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { ShoppingCart, Check, Star, Package, Gift, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { useQuery } from '@tanstack/react-query';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { useBuyBlindBoxMutation, useBuyShopItemMutation, useStudentShopData } from '@/hooks/queries/useShop';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';

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
  const studentId = user?.studentId ?? null;
  const { data: shopData, isLoading: loading, refetch: refetchShop } = useStudentShopData(studentId);
  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const data = (await studentsApi.getStudents()) as any;
      return data.students ?? [];
    },
  });
  const buyMutation = useBuyShopItemMutation(studentId);
  const buyBlindMutation = useBuyBlindBoxMutation(studentId);
  const items = (shopData?.items ?? []) as ShopItem[];
  const blindBoxes = ((shopData?.boxes ?? []) as BlindBox[]).filter((b) => b.is_active === 1);
  const availablePoints = (students as any[]).find((s) => s.id === studentId)?.available_points ?? 0;
  const [activeTab, setActiveTab] = useState<'normal' | 'blindbox'>('normal');
  const [unboxingResult, setUnboxingResult] = useState<{show: boolean, reward: string, isConsolation: boolean}>({ show: false, reward: '', isConsolation: false });
  const [isUnboxing, setIsUnboxing] = useState(false);

  const handleBuy = async (itemId: number) => {
    try {
      await buyMutation.mutateAsync(itemId);
      toast.success('兑换成功！已放入背包或生效');
      await refetchShop();
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    }
  };

  const handleBuyBlindBox = async (boxId: number) => {
    try {
      setIsUnboxing(true);
      const data = await buyBlindMutation.mutateAsync(boxId);
      setTimeout(async () => {
        setIsUnboxing(false);
        setUnboxingResult({
          show: true,
          reward: data.reward,
          isConsolation: data.reward.includes('安慰奖'),
        });
        if (!data.reward.includes('安慰奖')) {
          void launchConfetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 },
            colors: [...CELEBRATION.brand],
          });
        }
        await refetchShop();
      }, 2000);
    } catch (err) {
      console.error(err);
      setIsUnboxing(false);
      toast.error('网络错误');
    }
  };

  /**
   * The chunky tab control.
   *
   * `variant="ghost"` because every visible class is decided here: the tabs are not
   * the kit's standard control, they are the shop's two shelves, and the blind-box
   * shelf keeps the deep-sky identity its cards use (the supporting accent) while the
   * ordinary shelf stays on the brand green.
   */
  const tabClass = (isActive: boolean, activeClass: string) =>
    `h-auto rounded-card border-b-4 px-8 py-3 text-lg font-black ${
      isActive
        ? activeClass
        : 'border-border bg-paper text-ink-3 hover:bg-muted/50 hover:text-ink-1'
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-6xl space-y-8"
    >
      {/* Header */}
      <motion.div
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="relative overflow-hidden rounded-panel border-b-8 border-warning/30 bg-paper p-10 shadow-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-warning to-secondary opacity-10" />
        {/* Two slow drifting washes. `animate-blob` was never defined, so this replaces
            a class that compiled to nothing with an animation that actually plays. */}
        <motion.div
          aria-hidden="true"
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-warning/40 mix-blend-multiply blur-3xl"
        />
        <motion.div
          aria-hidden="true"
          animate={{ scale: [1.18, 1, 1.18] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-warning/20 mix-blend-multiply blur-3xl"
        />

        <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
          <PageHeader
            title="积分兑换商城"
            description="用你的努力换取超值奖励！"
            icon={ShoppingCart}
            className="flex-1"
          />

          <motion.div whileHover={{ scale: 1.05, rotate: 2 }} className="shrink-0">
            <StatCard
              label="我的余额"
              icon={Star}
              tone="warning"
              value={
                <span className="text-4xl font-black text-warning">
                  {availablePoints} <span className="text-xl font-bold">币</span>
                </span>
              }
              className="border-b-8 border-r-4 border-l-4 border-t-4 border-warning/30 shadow-raised"
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="mb-8 flex justify-center space-x-4">
        <Button
          variant="ghost"
          onClick={() => setActiveTab('normal')}
          className={tabClass(activeTab === 'normal', 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
        >
          常规商品
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab('blindbox')}
          className={tabClass(activeTab === 'blindbox', 'border-accent-foreground bg-accent-foreground text-paper hover:bg-accent-foreground/90 hover:text-paper')}
        >
          <Gift className="mr-2 size-5" />
          神秘盲盒
        </Button>
      </div>

      {/* Item Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-ink-3">
          <Spinner size="lg" label="正在加载商品" />
          <span className="text-2xl font-black">加载中...</span>
        </div>
      ) : activeTab === 'normal' ? (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                className="h-full"
              >
                <Card
                  className={`flex h-full flex-col gap-0 overflow-hidden rounded-panel border-4 border-b-8 py-0 shadow-card transition-all ${
                    canAfford
                      ? 'border-warning/30 hover:border-warning hover:shadow-raised'
                      : 'border-border opacity-80 grayscale-[0.5]'
                  }`}
                >
                  {/* Image Placeholder */}
                  <div className="group relative flex h-48 items-center justify-center border-b-4 border-warning/20 bg-gradient-to-br from-warning/10 to-secondary p-6">
                    <Badge
                      variant={isOutOfStock ? 'destructive' : 'outline'}
                      className={`absolute right-4 top-4 h-auto bg-paper/90 px-4 py-2 text-sm font-black shadow-card backdrop-blur-sm ${isOutOfStock ? '' : 'text-ink-2'}`}
                    >
                      库存: {item.stock === -1 ? '无限' : item.stock}
                    </Badge>
                    <ShoppingCart className={`size-20 transition-transform duration-300 group-hover:scale-110 ${canAfford ? 'text-warning drop-shadow-md' : 'text-ink-3'}`} />
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <CardTitle className="mb-3 text-2xl font-black text-ink-1">{item.name}</CardTitle>
                    <p className="mb-6 flex-1 text-base font-medium leading-relaxed text-ink-2">{item.description}</p>

                    <div className="mt-auto flex items-center justify-between border-t-4 border-dashed border-border pt-4">
                      <div className="flex items-baseline">
                        <span className={`text-4xl font-black ${canAfford ? 'text-warning drop-shadow-sm' : 'text-ink-3'}`}>{item.price}</span>
                        <span className="ml-1 text-lg font-bold text-ink-3">币</span>
                      </div>
                      <motion.div whileTap={canAfford ? { scale: 0.95 } : {}}>
                        <Button
                          onClick={() => handleBuy(item.id)}
                          disabled={!canAfford}
                          className={`h-auto rounded-card border-b-4 px-6 py-3 text-lg font-black ${
                            canAfford
                              ? 'border-warning bg-warning text-warning-foreground hover:bg-warning/90'
                              : 'cursor-not-allowed border-border bg-muted text-ink-3'
                          }`}
                        >
                          {isOutOfStock ? '已售罄' : canAfford ? '立即兑换' : '积分不足'}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {items.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full"
            >
              <EmptyState
                icon={Check}
                title="商城暂时没有商品"
                description="请等待老师上架新物品哦"
                className="min-h-60 border-4 border-dashed bg-paper"
              />
            </motion.div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {blindBoxes.map((box, index) => {
            const canAfford = availablePoints >= box.price;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={box.id}
                whileHover={canAfford && !isUnboxing ? { scale: 1.05, y: -10 } : {}}
                className="h-full"
              >
                <Card
                  className={`flex h-full flex-col gap-0 overflow-hidden rounded-panel border-4 border-b-8 py-0 shadow-card transition-all ${
                    canAfford && !isUnboxing
                      ? 'border-accent-foreground/40 hover:border-accent-foreground hover:shadow-raised'
                      : 'border-border opacity-80 grayscale-[0.5]'
                  }`}
                >
                  <div className="group relative flex h-48 items-center justify-center overflow-hidden border-b-4 border-accent-foreground bg-gradient-to-br from-accent-foreground to-info p-6">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
                    <motion.div
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    >
                      <Package className={`size-24 text-paper drop-shadow-md transition-transform duration-300 group-hover:scale-110`} />
                    </motion.div>
                    <Sparkles className="absolute right-6 top-6 size-8 animate-pulse text-warning" />
                    <Sparkles className="absolute bottom-6 left-6 size-6 animate-pulse text-accent [animation-delay:1s]" />
                  </div>

                  <div className="relative flex flex-1 flex-col p-6">
                    <CardTitle className="mb-3 text-2xl font-black text-ink-1">{box.name}</CardTitle>
                    <p className="mb-6 flex-1 text-base font-medium leading-relaxed text-ink-2">{box.description}</p>

                    <div className="mt-auto flex items-center justify-between border-t-4 border-dashed border-border pt-4">
                      <div className="flex items-baseline">
                        <span className={`text-4xl font-black ${canAfford ? 'text-accent-foreground drop-shadow-sm' : 'text-ink-3'}`}>{box.price}</span>
                        <span className="ml-1 text-lg font-bold text-ink-3">币</span>
                      </div>
                      <motion.div whileTap={canAfford && !isUnboxing ? { scale: 0.95 } : {}}>
                        <Button
                          onClick={() => handleBuyBlindBox(box.id)}
                          disabled={!canAfford || isUnboxing}
                          className={`h-auto rounded-card border-b-4 px-6 py-3 text-lg font-black ${
                            canAfford && !isUnboxing
                              ? 'border-accent-foreground bg-gradient-to-r from-accent-foreground to-info text-paper hover:from-accent-foreground/90 hover:to-info/90'
                              : 'cursor-not-allowed border-border bg-muted text-ink-3'
                          }`}
                        >
                          {canAfford ? '开启盲盒' : '积分不足'}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {blindBoxes.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full"
            >
              <EmptyState
                icon={Package}
                title="暂无盲盒上架"
                description="请等待老师准备神秘惊喜哦"
                className="min-h-60 border-4 border-dashed bg-paper"
              />
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/80 backdrop-blur-md"
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
              <div className="absolute inset-0 rounded-full bg-accent-foreground opacity-50 blur-3xl"></div>
              <Package className="relative z-10 size-48 text-paper drop-shadow-md" />
            </motion.div>
          </motion.div>
        )}

        {unboxingResult.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-1/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, y: 100, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className={`w-full max-w-lg rounded-panel border-8 bg-paper p-10 text-center shadow-floating ${unboxingResult.isConsolation ? 'border-border' : 'border-warning'}`}
            >
              <div className={`mx-auto mb-8 flex size-32 items-center justify-center rounded-full ${unboxingResult.isConsolation ? 'bg-muted' : 'bg-warning/10'}`}>
                {unboxingResult.isConsolation ? (
                  <Gift className="size-16 text-ink-3" />
                ) : (
                  <Zap className="size-16 fill-warning text-warning" />
                )}
              </div>
              <h3 className="mb-4 text-3xl font-black text-ink-1">
                {unboxingResult.isConsolation ? '再接再厉' : '恭喜你！'}
              </h3>
              <p className={`mb-10 text-2xl font-bold ${unboxingResult.isConsolation ? 'text-ink-3' : 'text-accent-foreground'}`}>
                {unboxingResult.reward}
              </p>
              <Button
                onClick={() => setUnboxingResult({ show: false, reward: '', isConsolation: false })}
                className="h-auto w-full rounded-card py-4 text-xl font-black"
              >
                收下奖励
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
