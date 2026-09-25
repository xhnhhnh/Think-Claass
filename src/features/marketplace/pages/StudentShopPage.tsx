import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Check, Gift, Package, ShoppingCart, Sparkles, Star, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

import { studentsApi } from '@/features/classroom/api/studentsApi';
import { useBuyBlindBoxMutation, useBuyShopItemMutation, useStudentShopData } from '@/hooks/queries/useShop';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';

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

/**
 * 积分商城 (the page's own header called it 积分兑换商城).
 *
 * A `dashboard`: the page's own `PageHeader` is gone, the balance is the `StatCard`
 * it always wanted, and the two shelves are the kit's `Segmented`. `title` is the
 * route table's label, which is where the shell's `h1` comes from. The two drifting
 * washes stay - they are the shop's identity, and they are `warning`-toned tokens
 * rather than fixed amber utilities.
 *
 * The awarded blind box is now the kit's `Dialog` instead of a hand-built overlay,
 * so it traps focus and can be dismissed with Escape; the transient unboxing
 * animation stays an overlay, because there is nothing in it to interact with. The
 * two purchases, the two-second reveal, the confetti and every label are unchanged.
 */
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
  const shouldReduceMotion = useReducedMotion();

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

  const closeUnboxingResult = () =>
    setUnboxingResult({ show: false, reward: '', isConsolation: false });

  return (
    <PageScaffold
      variant="dashboard"
      title="积分商城"
      description="用你的努力换取超值奖励！"
      toolbar={
        <Segmented<'normal' | 'blindbox'>
          label="商城货架"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'normal', label: '常规商品' },
            {
              value: 'blindbox',
              label: (
                <>
                  <Gift aria-hidden="true" className="size-4" />
                  神秘盲盒
                </>
              ),
            },
          ]}
        />
      }
    >
      <div className="grid gap-4 sm:max-w-sm">
        <StatCard
          label="我的余额"
          icon={Star}
          tone="warning"
          value={
            <span className="text-3xl font-black text-warning">
              {availablePoints} <span className="text-lg font-bold">币</span>
            </span>
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-fg-3">
          <Spinner size="lg" label="正在加载商品" />
          <span className="text-xl font-black">加载中...</span>
        </div>
      ) : activeTab === 'normal' ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item, index) => {
            const isOutOfStock = item.stock === 0;
            const canAfford = availablePoints >= item.price && !isOutOfStock;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 16 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                transition={{ delay: index * 0.06 }}
                whileHover={canAfford && !shouldReduceMotion ? { y: -6 } : undefined}
                className="h-full"
              >
                <Card
                  className={cn(
                    'flex h-full flex-col gap-0 overflow-hidden rounded-panel border-2 py-0 shadow-card transition-all',
                    canAfford
                      ? 'border-warning/40 hover:border-warning hover:shadow-raised'
                      : 'border-line-1 opacity-80',
                  )}
                >
                  <div className="group relative flex h-44 items-center justify-center border-b border-line-1 bg-gradient-to-br from-warning-soft to-surface-3 p-6">
                    <Badge
                      variant={isOutOfStock ? 'destructive' : 'outline'}
                      className="absolute right-4 top-4 h-auto bg-surface-2/90 px-3 py-1.5 text-sm font-black shadow-card"
                    >
                      库存: {item.stock === -1 ? '无限' : item.stock}
                    </Badge>
                    <ShoppingCart
                      aria-hidden="true"
                      className={cn(
                        'size-16 transition-transform duration-300 group-hover:scale-110',
                        canAfford ? 'text-warning' : 'text-fg-3',
                      )}
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <CardTitle className="mb-2 text-xl font-black text-fg-1">{item.name}</CardTitle>
                    <p className="mb-6 flex-1 text-sm leading-relaxed text-fg-2">{item.description}</p>

                    <div className="mt-auto flex items-center justify-between border-t border-dashed border-line-1 pt-4">
                      <div className="flex items-baseline">
                        <span className={cn('text-3xl font-black', canAfford ? 'text-warning' : 'text-fg-3')}>
                          {item.price}
                        </span>
                        <span className="ml-1 text-base font-bold text-fg-3">币</span>
                      </div>
                      <Button
                        onClick={() => handleBuy(item.id)}
                        disabled={!canAfford}
                        className={cn(canAfford && 'bg-warning text-fg-inverse hover:bg-warning/90')}
                      >
                        {isOutOfStock ? '已售罄' : canAfford ? '立即兑换' : '积分不足'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {items.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full">
              <EmptyState
                icon={Check}
                title="商城暂时没有商品"
                description="请等待老师上架新物品哦"
              />
            </motion.div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {blindBoxes.map((box, index) => {
            const canAfford = availablePoints >= box.price;
            return (
              <motion.div
                key={box.id}
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 16 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
                transition={{ delay: index * 0.06 }}
                whileHover={canAfford && !isUnboxing && !shouldReduceMotion ? { y: -6 } : undefined}
                className="h-full"
              >
                <Card
                  className={cn(
                    'flex h-full flex-col gap-0 overflow-hidden rounded-panel border-2 py-0 shadow-card transition-all',
                    canAfford && !isUnboxing
                      ? 'border-role-ink/40 hover:border-role-ink hover:shadow-raised'
                      : 'border-line-1 opacity-80',
                  )}
                >
                  <div className="group relative flex h-44 items-center justify-center overflow-hidden border-b border-role-ink bg-gradient-to-br from-role-ink to-info p-6">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay" />
                    <motion.div
                      animate={shouldReduceMotion ? undefined : { rotate: [0, 5, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    >
                      <Package
                        aria-hidden="true"
                        className="size-20 text-role-contrast transition-transform duration-300 group-hover:scale-110"
                      />
                    </motion.div>
                    <Sparkles aria-hidden="true" className="absolute right-5 top-5 size-7 animate-pulse text-warning" />
                    <Sparkles aria-hidden="true" className="absolute bottom-5 left-5 size-6 animate-pulse text-info" />
                  </div>

                  <div className="relative flex flex-1 flex-col p-6">
                    <CardTitle className="mb-2 text-xl font-black text-fg-1">{box.name}</CardTitle>
                    <p className="mb-6 flex-1 text-sm leading-relaxed text-fg-2">{box.description}</p>

                    <div className="mt-auto flex items-center justify-between border-t border-dashed border-line-1 pt-4">
                      <div className="flex items-baseline">
                        <span className={cn('text-3xl font-black', canAfford ? 'text-role-ink' : 'text-fg-3')}>
                          {box.price}
                        </span>
                        <span className="ml-1 text-base font-bold text-fg-3">币</span>
                      </div>
                      <Button
                        onClick={() => handleBuyBlindBox(box.id)}
                        disabled={!canAfford || isUnboxing}
                        className={cn(
                          canAfford && !isUnboxing && 'bg-role-ink text-role-contrast hover:bg-role-ink/90',
                        )}
                      >
                        {canAfford ? '开启盲盒' : '积分不足'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {blindBoxes.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full">
              <EmptyState
                icon={Package}
                title="暂无盲盒上架"
                description="请等待老师准备神秘惊喜哦"
              />
            </motion.div>
          )}
        </div>
      )}

      {/* The reveal itself: a transient animation with nothing to interact with, so it
          stays an overlay rather than a dialog. */}
      <AnimatePresence>
        {isUnboxing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-fg-1/80 backdrop-blur-md"
          >
            <motion.div
              animate={
                shouldReduceMotion
                  ? undefined
                  : { scale: [1, 1.2, 1], rotate: [0, -10, 10, -10, 10, 0], y: [0, -20, 0] }
              }
              transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-full bg-role-ink opacity-50 blur-3xl" />
              <Package aria-hidden="true" className="relative z-10 size-40 text-role-contrast" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* What came out of it: a real dialog now, so the reward is announced and Escape closes it. */}
      <Dialog
        open={unboxingResult.show}
        onOpenChange={(open) => {
          if (!open) closeUnboxingResult();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-black text-fg-1">
              {unboxingResult.isConsolation ? '再接再厉' : '恭喜你！'}
            </DialogTitle>
          </DialogHeader>
          <div
            className={cn(
              'mx-auto flex size-28 items-center justify-center rounded-full',
              unboxingResult.isConsolation ? 'bg-surface-3' : 'bg-warning-soft',
            )}
          >
            {unboxingResult.isConsolation ? (
              <Gift aria-hidden="true" className="size-14 text-fg-3" />
            ) : (
              <Zap aria-hidden="true" className="size-14 fill-warning text-warning" />
            )}
          </div>
          <p
            className={cn(
              'text-center text-xl font-bold',
              unboxingResult.isConsolation ? 'text-fg-3' : 'text-role-ink',
            )}
          >
            {unboxingResult.reward}
          </p>
          <Button onClick={closeUnboxingResult} className="w-full py-3 text-lg font-black">
            收下奖励
          </Button>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  );
}
