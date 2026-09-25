import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { ShieldAlert, Zap, Cookie, Play, Star, Plus, Heart, List, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion, useReducedMotion } from 'framer-motion';
import DanmakuOverlay from '@/components/DanmakuOverlay';

import { getEvolutionStage, getPetDisplayImage, getPetElement, PET_ELEMENTS } from '@/features/pet/petConfig';
import type { PetDto } from '@/features/pet/types';
import { usePetActionMutation, useStudentPetData } from '@/features/pet/hooks/usePet';
import { launchConfetti } from '@/lib/confetti';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * 我的学习精灵.
 *
 * The creature, its stage art and the adoption tiles are the game feel, so the springs
 * and the colour wash behind the pet stay - travel is dropped under
 * `prefers-reduced-motion` and the fade is kept. Three things had to change:
 *
 *   - The selected element tile assembled its own class at runtime
 *     (`border-${el.color.split('-')[1]}-600`), which only exists if Tailwind happened to
 *     see the finished string - it selected the primary ring instead, which is why the
 *     tile is a kit `Button` with a static state now.
 *   - The experience bar's width was an inline style; the kit's `Progress` owns it.
 *   - The points ledger was a hand-built overlay with a raw close button; it is the kit
 *     `Dialog` now, so the close control has an accessible name.
 *
 * The orange family the page was written in is the `warning` token: it is the same
 * surface, and `--warning` follows the role theme instead of being a fixed palette entry.
 */
export default function StudentPet() {
  const user = useStore((state) => state.user);
  const studentId = user?.studentId ?? null;
  const classId = Number(user?.classId ?? user?.class_id) || null;
  const { data: classFeatureData } = useClassFeatures(classId, { refetchInterval: 5000 });
  const showDanmaku = Boolean(classFeatureData?.features.enable_danmaku);
  const { data, isLoading, refetch } = useStudentPetData(studentId);
  const petMutation = usePetActionMutation(studentId);
  const [pet, setPet] = useState<PetDto | null>(null);
  const loading = isLoading;
  const [adopting, setAdopting] = useState(false);
  const [selectedElement, setSelectedElement] = useState('');
  const [availablePoints, setAvailablePoints] = useState(0);
  const [praises, setPraises] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [showRecords, setShowRecords] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!data) return;
    setPet((data.pet as PetDto) ?? null);
    setAvailablePoints(data.availablePoints ?? 0);
    setPraises(data.praises ?? []);
    setRecords(data.records ?? []);
  }, [data]);

  const handleAdopt = async () => {
    if (!selectedElement) return;
    setAdopting(true);
    try {
      await petMutation.mutateAsync({ type: 'adopt', elementType: selectedElement });
      toast.success('领养成功！开启你的学习之旅吧');
      await refetch();
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    } finally {
      setAdopting(false);
    }
  };

  const handleInteract = async (actionType: string, cost: number, expGain: number, type: string = 'FEED_PET') => {
    if (availablePoints < cost) {
      toast.warning('可用积分不足！快去赚取更多积分吧');
      return;
    }

    try {
      const oldLevel = pet?.level || 1;

      const data = (await petMutation.mutateAsync({
        type: 'interact',
        actionType,
        cost,
        expGain,
        actionLogType: type,
      })) as any;
      setPet(data.pet);
      setAvailablePoints(data.points);
      toast.success(`交互成功！经验 +${expGain}`);
      if (data.pet.level > oldLevel) {
        triggerEvolutionEffect();
        toast.success(`🎉 恭喜！你的精灵进化到了【${getEvolutionStage(data.pet.level)}】！`, {
          duration: 5000,
          icon: '🌟'
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('网络错误');
    }
  };

  const triggerEvolutionEffect = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      void launchConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      void launchConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const [petMessage, setPetMessage] = useState<string | null>(null);

  const handlePetClick = () => {
    const messages = [
      "主人，今天也要努力学习哦！",
      "我饿啦，能给我喂点好吃的吗？",
      "我们一起变得更强吧！",
      "你真棒，我为你骄傲！",
      "特训能让我获得更多经验呢！"
    ];
    setPetMessage(messages[Math.floor(Math.random() * messages.length)]);
    setTimeout(() => setPetMessage(null), 3000);
  };

  if (loading) {
    return (
      <PageScaffold variant="dashboard" className="flex items-center justify-center p-20">
        <div className="flex items-center justify-center gap-2 text-fg-3">
          <Spinner size="lg" label="正在加载精灵数据" />
          加载中...
        </div>
      </PageScaffold>
    );
  }

  if (!pet) {
    return (
      <PageScaffold variant="dashboard">
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 20 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0 }) }}
          className="mx-auto max-w-4xl overflow-hidden rounded-panel border-8 border-warning/20 bg-surface-2 shadow-floating"
        >
          <div className="border-b-8 border-warning/70 bg-warning p-8 text-center text-fg-inverse">
            <h2 className="mb-2 text-4xl font-black drop-shadow-md">欢迎来到 Think-Class</h2>
            <p className="text-xl font-bold text-fg-inverse/80">领养你的专属精灵伙伴，开启学习冒险之旅！</p>
          </div>
          <div className="p-8">
            <h3 className="mb-6 text-center text-2xl font-black text-fg-1">选择精灵属性</h3>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
              {PET_ELEMENTS.map((el) => (
                /*
                  The tile keeps its spring, but the interactive element is the kit's
                  `Button`: the tile used to be a `div` with `role="button"`, which keyboard
                  users could not reach at all.
                */
                <motion.div
                  key={el.id}
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.05, y: -5 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={selectedElement === el.id}
                    onClick={() => setSelectedElement(el.id)}
                    className={cn(
                      'h-full w-full flex-col gap-0 rounded-panel border-4 border-b-8 p-6',
                      selectedElement === el.id
                        ? cn('border-role shadow-raised ring-4 ring-role/30 ring-offset-4', el.bg)
                        : 'border-line-1 bg-surface-3/50 hover:border-role/30 hover:bg-surface-3',
                    )}
                  >
                    <div className="mb-4 text-6xl drop-shadow-md">{el.icon}</div>
                    <div className="text-xl font-black text-fg-1">{el.name}</div>
                  </Button>
                </motion.div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <motion.div
                whileHover={selectedElement && !adopting && !shouldReduceMotion ? { scale: 1.05, y: -5 } : {}}
                whileTap={selectedElement && !adopting && !shouldReduceMotion ? { scale: 0.95, y: 0 } : {}}
                className="inline-block"
              >
                <Button
                  onClick={handleAdopt}
                  disabled={!selectedElement || adopting}
                  className="h-auto rounded-panel border-b-8 border-fg-1/20 px-12 py-5 text-2xl font-black shadow-raised"
                >
                  {adopting ? '领养中...' : '确认领养'}
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </PageScaffold>
    );
  }

  const element = getPetElement(pet.element_type);
  const progressPercent = ((pet.experience % 100) / 100) * 100;

  const currentPetImage = getPetDisplayImage(pet as unknown as Record<string, unknown>) ?? '';

  return (
    <PageScaffold variant="dashboard">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-4xl space-y-6"
      >
        {classId && showDanmaku ? <DanmakuOverlay classId={classId} /> : null}
        {/* Top Status */}
        <div className="flex items-center justify-between rounded-panel border-b-8 border-line-1 bg-surface-2 p-6 shadow-card">
          <div className="flex items-center space-x-4">
            <div className="rounded-card border-b-4 border-warning/20 bg-warning/10 p-4">
              <Star className="size-8 fill-current text-warning" />
            </div>
            <div>
              <p className="text-sm font-bold text-fg-3">当前可用积分</p>
              <p className="text-3xl font-black text-warning">{availablePoints} <span className="text-lg font-bold">币</span></p>
            </div>
          </div>
          <div className="flex space-x-4">
            <Button
              variant="outline"
              onClick={() => setShowRecords(true)}
              className="h-auto rounded-card border-b-4 border-role/20 bg-role/5 px-5 py-3 font-bold text-role hover:bg-role/10 hover:text-role"
            >
              <List className="size-5" /> 积分明细
            </Button>
            <Button
              variant="outline"
              className="h-auto rounded-card border-b-4 border-warning/20 bg-warning/10 px-5 py-3 font-bold text-warning hover:bg-warning/20 hover:text-warning"
            >
              <Plus className="size-5" /> 去赚积分
            </Button>
          </div>
        </div>

        {/* Pet Main Area */}
        <motion.div
          initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.95 }) }}
          animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
          className={cn(
            'relative flex min-h-[500px] flex-col justify-between overflow-hidden rounded-panel border-8 border-surface-2 shadow-floating',
            element.bg,
          )}
        >
          {/* Environment Background decorative: a tokenised dot grid, not a page-level style */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--fg-1))_3px,transparent_3px)] opacity-20 [background-size:40px_40px]" />

          {/* Parent Buff Effect */}
          {pet.has_parent_buff && (
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-panel">
              <div className="absolute left-0 top-0 h-full w-full animate-pulse bg-gradient-to-b from-warning/20 to-transparent" />
              <div className="absolute -left-20 -top-20 size-64 animate-[pulse_4s_ease-in-out_infinite] rounded-full bg-warning opacity-60 mix-blend-screen blur-[80px] filter" />
              <div className="absolute -bottom-20 -right-20 size-64 animate-[pulse_5s_ease-in-out_infinite] rounded-full bg-warning opacity-60 mix-blend-screen blur-[80px] filter" />
            </div>
          )}

          {/* Status Bar */}
          <div className="relative z-10 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row">
            <div className="inline-block rounded-panel border-b-4 border-line-1 bg-surface-2/90 px-6 py-4 shadow-card backdrop-blur-sm">
              <h2 className="flex items-center text-3xl font-black text-fg-1 drop-shadow-sm">
                <span className="mr-3 text-4xl">{element.icon}</span> {element.name}精灵
              </h2>
              <div className="mt-3 flex items-center space-x-4 text-sm font-bold text-fg-2">
                <span className="flex items-center rounded-pill border-b-4 border-line-1 bg-surface-2 px-4 py-2 shadow-card">
                  Lv.{pet.level} {getEvolutionStage(pet.level)}
                </span>
                <span className="flex items-center rounded-pill border-b-4 border-line-1 bg-surface-2 px-4 py-2 shadow-card">
                  <ShieldAlert className="mr-2 size-5 text-danger" /> 攻击力: {pet.attack_power}
                </span>
              </div>
            </div>

            {pet.has_parent_buff && (
              <motion.div
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { scale: 0.8 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { scale: 1 }) }}
                className="flex shrink-0 animate-bounce items-center rounded-panel border-4 border-surface-2 bg-gradient-to-r from-warning to-warning/70 px-6 py-4 font-black text-fg-inverse shadow-glow-role [animation-duration:3s]"
              >
                <Heart className="mr-2 size-6 fill-current" />
                <div>
                  <div className="text-sm text-fg-inverse/80 opacity-90">母爱的祝福</div>
                  <div className="text-lg">成长奖励正在进行</div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Character Center */}
          <div className="group relative z-10 flex flex-1 cursor-pointer items-center justify-center" onClick={handlePetClick}>
            {petMessage && (
              <motion.div
                initial={{ opacity: 0, ...(shouldReduceMotion ? {} : { y: 10, scale: 0.8 }) }}
                animate={{ opacity: 1, ...(shouldReduceMotion ? {} : { y: 0, scale: 1 }) }}
                className="absolute top-4 z-30 whitespace-nowrap rounded-panel border-4 border-warning/20 bg-surface-2 px-6 py-3 text-lg font-black text-warning shadow-raised"
              >
                {petMessage}
                <div className="absolute -bottom-3 left-1/2 h-0 w-0 -translate-x-1/2 transform border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent border-t-surface-2 drop-shadow-md" />
              </motion.div>
            )}

            <motion.div
              animate={shouldReduceMotion ? undefined : { y: [0, -15, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="group-hover:scale-105 relative flex size-72 items-center justify-center rounded-full border-8 border-surface-2 bg-surface-2 shadow-floating transition-transform duration-300"
            >
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                <img src={currentPetImage} alt="我的精灵" className="h-full w-full object-contain" />
              </div>

              {pet.level > 1 && (
                <div className="absolute -bottom-6 z-20 rounded-pill border-4 border-surface-2 bg-warning px-6 py-2 text-xl font-black text-fg-inverse shadow-raised">
                  Lv.{pet.level}
                </div>
              )}

              {/* Mood Badge */}
              <div className="absolute right-0 top-0 z-20 flex size-16 items-center justify-center rounded-full border-4 border-line-1 bg-surface-2 text-3xl shadow-raised">
                {(pet as any).mood === 'excited' ? '🤩' : (pet as any).mood === 'sad' ? '😢' : (pet as any).mood === 'dizzy' ? '😵' : '😊'}
              </div>
            </motion.div>
          </div>

          {/* Experience Bar & Actions */}
          <div className="relative z-10 border-t-4 border-surface-2 bg-surface-2/95 p-8 backdrop-blur-md">
            <div className="mb-8">
              <div className="mb-3 flex justify-between text-base font-black text-fg-2">
                <span>经验值 ({pet.experience} / {pet.level * 100})</span>
                <span>距下一级 {pet.level * 100 - pet.experience}</span>
              </div>
              <Progress value={progressPercent} label={`经验值 ${pet.experience} / ${pet.level * 100}`} />
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <motion.div whileHover={shouldReduceMotion ? undefined : { scale: 1.05, y: -5 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleInteract('喂食普通食物', 10, 10, 'FEED_PET')}
                  className="group h-full w-full flex-col gap-0 rounded-panel border-4 border-b-8 border-warning/30 bg-surface-2 p-6 shadow-card hover:border-warning hover:bg-warning/5"
                >
                  <div className="mb-3 rounded-full bg-warning/10 p-4 shadow-inner transition-transform group-hover:scale-110">
                    <Cookie className="size-8 text-warning" />
                  </div>
                  <span className="text-lg font-black text-fg-1">喂食</span>
                  <span className="mt-1 text-sm font-bold text-fg-3">(10币)</span>
                  <span className="mt-2 rounded-pill bg-warning/10 px-3 py-1 text-sm font-black text-warning">+10 EXP</span>
                </Button>
              </motion.div>
              <motion.div whileHover={shouldReduceMotion ? undefined : { scale: 1.05, y: -5 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleInteract('买玩具', 30, 35, 'BUY_TOY')}
                  className="group h-full w-full flex-col gap-0 rounded-panel border-4 border-b-8 border-role/30 bg-surface-2 p-6 shadow-card hover:border-role hover:bg-role/5"
                >
                  <div className="mb-3 rounded-full bg-role/10 p-4 shadow-inner transition-transform group-hover:scale-110">
                    <Play className="size-8 text-role" />
                  </div>
                  <span className="text-lg font-black text-fg-1">玩具</span>
                  <span className="mt-1 text-sm font-bold text-fg-3">(30币)</span>
                  <span className="mt-2 rounded-pill bg-role/10 px-3 py-1 text-sm font-black text-role">+35 EXP</span>
                </Button>
              </motion.div>
              <motion.div whileHover={shouldReduceMotion ? undefined : { scale: 1.05, y: -5 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleInteract('基础训练', 60, 80, 'TRAIN')}
                  className="group h-full w-full flex-col gap-0 rounded-panel border-4 border-b-8 border-success/30 bg-surface-2 p-6 shadow-card hover:border-success hover:bg-success/5"
                >
                  <div className="mb-3 rounded-full bg-success/10 p-4 shadow-inner transition-transform group-hover:scale-110">
                    <Zap className="size-8 text-success" />
                  </div>
                  <span className="text-lg font-black text-fg-1">训练</span>
                  <span className="mt-1 text-sm font-bold text-fg-3">(60币)</span>
                  <span className="mt-2 rounded-pill bg-success/10 px-3 py-1 text-sm font-black text-success">+80 EXP</span>
                </Button>
              </motion.div>
              <motion.div whileHover={shouldReduceMotion ? undefined : { scale: 1.05, y: -5 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleInteract('高阶特训', 150, 220, 'SPECIAL_TRAIN')}
                  className="group h-full w-full flex-col gap-0 rounded-panel border-4 border-b-8 border-role-ink/30 bg-surface-2 p-6 shadow-card hover:border-role-ink hover:bg-role-soft"
                >
                  <div className="mb-3 rounded-full bg-role-soft p-4 shadow-inner transition-transform group-hover:scale-110">
                    <Star className="size-8 text-role-ink" />
                  </div>
                  <span className="text-lg font-black text-fg-1">特训</span>
                  <span className="mt-1 text-sm font-bold text-fg-3">(150币)</span>
                  <span className="mt-2 rounded-pill bg-role-soft px-3 py-1 text-sm font-black text-role-ink">+220 EXP</span>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
        {/* Praise Wall Area */}
        {praises.length > 0 && (
          <div className="mt-8 rounded-panel border-b-8 border-line-1 bg-surface-2 p-8 shadow-card">
            <h3 className="mb-8 flex items-center text-2xl font-black text-fg-1">
              <Heart className="mr-3 size-8 fill-current text-danger" />
              心里话墙 (老师的表扬)
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {praises.map((praise) => (
                <motion.div
                  whileHover={shouldReduceMotion ? undefined : { scale: 1.05, rotate: 2 }}
                  key={praise.id}
                  className={cn(
                    'relative transform rounded-panel border-b-8 border-line-1 p-6 shadow-card transition-transform duration-200',
                    // The note colour is the teacher's choice and arrives with the record, so
                    // it stays a value; the fallback is the token for "a sticky note".
                    praise.color || 'bg-warning/10',
                  )}
                >
                  <div className="absolute -top-3 left-1/2 h-4 w-12 -translate-x-1/2 rounded-pill bg-danger/40 shadow-inner" />
                  <p className="whitespace-pre-wrap pt-3 text-base font-bold leading-relaxed text-fg-1">
                    {praise.content}
                  </p>
                  <div className="mt-4 text-right text-sm font-black text-fg-2">
                    — {new Date(praise.created_at).toLocaleDateString()}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Points Detail Modal */}
        <Dialog open={showRecords} onOpenChange={setShowRecords}>
          <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center text-2xl font-black text-fg-1">
                <List className="mr-3 size-8 text-role" />
                积分明细
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {records.length === 0 ? (
                <EmptyState icon={List} title="暂无积分记录" />
              ) : (
                <div className="space-y-4">
                  {records.map((record) => (
                    <div key={record.id} className="flex items-center justify-between rounded-card border-b-4 border-line-1 bg-surface-2 p-5 shadow-card">
                      <div>
                        <div className="mb-1 text-lg font-black text-fg-1">{record.description}</div>
                        <div className="text-sm font-bold text-fg-3">{new Date(record.created_at).toLocaleString()}</div>
                      </div>
                      <div className={cn('flex items-center rounded-card px-4 py-2 text-2xl font-black', record.amount > 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                        {record.amount > 0 ? <ArrowUpRight className="mr-1 size-6" /> : <ArrowDownRight className="mr-1 size-6" />}
                        {Math.abs(record.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </PageScaffold>
  );
}
