import { useState, useEffect } from 'react';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { useStore } from '@/store/useStore';
import { Maximize, Users, Award, Star, TrendingUp, ShieldAlert, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import DanmakuOverlay from '@/components/DanmakuOverlay';
import ClassFeaturePanel from '@/pages/Teacher/components/ClassFeaturePanel';

import { classroomApi } from '@/features/classroom/api/classesApi';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { defaultClassFeatures } from '@/lib/classFeatures';
import { launchConfetti } from '@/lib/confetti';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface ClassItem {
  id: number;
  name: string;
  invite_code: string;
}

/**
 * 大屏展示.
 *
 * A projection-stage surface (docs/design-system.md §2.6): what is tokenised here is
 * the *palette and the radii* - the indigo/violet utilities, the `#0B0C10` backdrop
 * and the arbitrary glow shadows are gone - while the layout, the oversized type, the
 * dark fullscreen stage, the confetti and the HP-bar animation stay exactly as they
 * were. Card-ifying it would trade a readable-from-the-back-of-the-room screen for a
 * console.
 *
 * Two consequences of staying dark, both deliberate:
 *   - Controls that only render inside the fullscreen stage keep a dark surface and
 *     pass it through `className`, because the kit's light default is unreadable
 *     there. Controls on the light (non-fullscreen) shell use the kit's own variants.
 *   - The countdown readout is a `<button>`, not a kit `Button`: in the stage it is a
 *     3xl/5xl instrument readout, and the kit sizes a control to 2.25rem.
 *
 * Polling, the boss-defeat confetti, the countdown interval and every string are
 * unchanged.
 */
export default function TeacherBigscreen() {
  const user = useStore((state) => state.user);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [bigscreenData, setBigscreenData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownInput, setCountdownInput] = useState('10');
  const [showCountdownConfig, setShowCountdownConfig] = useState(false);
  const [prevBossHp, setPrevBossHp] = useState<number | null>(null);
  const { data: classFeatureData } = useClassFeatures(selectedClassId);
  const classFeatures = classFeatureData?.features ?? defaultClassFeatures;

  useEffect(() => {
    fetchClasses();
  }, []);

  // Handle Boss Defeat Animation
  useEffect(() => {
    if (classFeatures.enable_world_boss && bigscreenData?.activeBoss) {
      if (prevBossHp !== null && bigscreenData.activeBoss.hp === 0 && prevBossHp > 0) {
        void launchConfetti({
          particleCount: 200,
          spread: 160,
          origin: { y: 0.3 },
          colors: [...CELEBRATION.blaze]
        });
      }
      setPrevBossHp(bigscreenData.activeBoss.hp);
    }
  }, [bigscreenData?.activeBoss?.hp, classFeatures.enable_world_boss, prevBossHp]);

  // Handle Countdown Timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => setCountdown(prev => prev! - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const fetchClasses = async () => {
    try {
      const data = await classroomApi.getClasses();
      if (data.success) {
        setClasses(data.classes);
        if (data.classes.length > 0) {
          setSelectedClassId(data.classes[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchBigscreenData();
      const interval = setInterval(fetchBigscreenData, 10000); // refresh every 10s
      return () => clearInterval(interval);
    }
  }, [selectedClassId]);

  const fetchBigscreenData = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const data = await classroomApi.getBigscreen(selectedClassId);
      if (data.success) {
        setBigscreenData(data);
      }
    } catch (err) {
      console.error('Failed to fetch bigscreen data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        toast.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const startCountdown = () => {
    const mins = parseInt(countdownInput, 10);
    if (isNaN(mins) || mins <= 0) return;
    setCountdown(mins * 60);
    setShowCountdownConfig(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!classes.length) {
    return <div className="p-8 text-center text-ink-3">暂无班级数据，请先创建班级。</div>;
  }

  const isBossActive = classFeatures.enable_world_boss && bigscreenData?.activeBoss && bigscreenData.activeBoss.hp > 0;

  return (
    <div className={`relative flex h-full flex-col ${isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto bg-gray-900 p-8 text-white' : 'space-y-6'}`}>
      {selectedClassId && classFeatures.enable_danmaku ? <DanmakuOverlay classId={selectedClassId} /> : null}
      {/* Background Particles for Fullscreen */}
      {isFullscreen && (
        <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden bg-background">
          <div className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full bg-primary/20 mix-blend-screen blur-[120px]"></div>
          <div className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-accent/30 mix-blend-screen blur-[120px] [animation-delay:2s]"></div>
          <div className={`absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px] mix-blend-screen transition-all duration-1000 ${isBossActive ? 'animate-pulse bg-destructive/30' : 'bg-transparent'}`}></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
        </div>
      )}
      {!isFullscreen && (
        <div className="flex items-center justify-between rounded-card border border-border bg-paper/80 p-4 shadow-card backdrop-blur-xl">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="mr-2 flex-shrink-0 text-sm font-bold text-ink-3">选择班级:</span>
            {classes.map((cls) => (
              <Button
                key={cls.id}
                type="button"
                onClick={() => setSelectedClassId(cls.id)}
                className={cn(
                  'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  selectedClassId === cls.id
                    ? 'bg-gradient-to-r from-primary to-cyan-500 text-white shadow-card'
                    : 'border border-border bg-muted/50 text-ink-2 hover:bg-muted/50',
                )}
              >
                {cls.name}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            onClick={toggleFullscreen}
            className="ml-4 flex-shrink-0"
          >
            <Maximize data-icon="inline-start" />
            进入大屏模式
          </Button>
        </div>
      )}

      {!isFullscreen && selectedClassId && (
        <div className="rounded-card border border-border bg-paper/80 p-5 shadow-card backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-1">大屏功能摘要</h2>
              <p className="text-sm text-ink-3">关闭弹幕后将停止展示课堂弹幕，关闭世界 Boss 后大屏也会同步隐藏相关区块</p>
            </div>
          </div>
          <ClassFeaturePanel classId={selectedClassId} compact />
        </div>
      )}

      {isFullscreen && (
        <div className="relative z-10 mb-8 flex items-center justify-between">
          <h1 className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-raised">
            {bigscreenData?.class?.name} <span className="font-normal text-gray-400">|</span> 光荣榜
          </h1>
          <div className="flex items-center space-x-4">
            {/* Countdown Timer Button/Display */}
            <div className="relative">
              {countdown !== null ? (
                // A `<button>`, not a kit `Button`: in the stage this is a 3xl instrument
                // readout, and the kit sizes every control to 2.25rem.
                <button
                  type="button"
                  onClick={() => setCountdown(null)}
                  aria-label="点击取消倒计时"
                  className={`flex cursor-pointer items-center rounded-card border-2 px-6 py-3 font-mono text-3xl font-black shadow-raised transition-all ${
                    countdown <= 60
                      ? 'animate-pulse border-red-500/50 bg-red-500/20 text-red-400'
                      : 'border-primary/50 bg-primary/20 text-primary-foreground hover:bg-primary/30'
                  }`}
                  title="点击取消倒计时"
                >
                  <Clock aria-hidden="true" className="mr-3 h-8 w-8" />
                  {formatTime(countdown)}
                </button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCountdownConfig(!showCountdownConfig)}
                  className="h-auto rounded-card border border-gray-700 bg-gray-800/80 px-6 py-3 font-bold text-gray-300 backdrop-blur-md hover:bg-gray-700/80 hover:text-gray-200"
                >
                  <Clock data-icon="inline-start" />
                  专注倒计时
                </Button>
              )}

              {/* Config Popover */}
              <AnimatePresence>
                {showCountdownConfig && countdown === null && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 top-full z-50 mt-4 w-64 rounded-card border border-gray-700 bg-gray-800 p-4 shadow-floating backdrop-blur-xl"
                  >
                    <label htmlFor="countdown-minutes" className="mb-2 block text-sm font-medium text-gray-400">设置倒计时 (分钟)</label>
                    <div className="flex space-x-2">
                      <Input
                        id="countdown-minutes"
                        type="number"
                        value={countdownInput}
                        onChange={e => setCountdownInput(e.target.value)}
                        className="h-auto flex-1 rounded-card border-gray-700 bg-gray-900 px-3 py-2 font-mono text-lg text-white focus-visible:border-primary"
                        min="1"
                      />
                      <Button
                        type="button"
                        onClick={startCountdown}
                        className="h-auto rounded-card bg-primary px-4 py-2 font-bold text-primary-foreground hover:bg-primary/90"
                      >
                        开始
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[5, 10, 15, 20, 30, 45].map(m => (
                        <Button
                          key={m}
                          type="button"
                          variant="ghost"
                          onClick={() => { setCountdownInput(m.toString()); }}
                          className="h-auto rounded-card bg-gray-700 py-1.5 text-sm font-normal text-gray-300 hover:bg-gray-600 hover:text-gray-200"
                        >
                          {m}m
                        </Button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={toggleFullscreen}
              className="h-auto rounded-card border border-gray-700 bg-gray-800/80 px-6 py-3 text-sm font-bold text-gray-300 backdrop-blur-md hover:bg-gray-700/80 hover:text-gray-200"
            >
              退出大屏
            </Button>
          </div>
        </div>
      )}

      {/* World Boss Alert Section */}
      <AnimatePresence>
        {isBossActive && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.9 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.9 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            className={`relative z-10 mb-8 w-full overflow-hidden rounded-panel shadow-floating ${
              isFullscreen ? 'border-2 border-red-500/50 bg-gray-900/80 backdrop-blur-xl' : 'border border-destructive/30 bg-destructive/10'
            }`}
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 mix-blend-overlay"></div>
            <div className="relative flex flex-col items-center justify-between gap-8 p-8 md:flex-row">
              <div className="flex w-full flex-1 items-center">
                <div className={`mr-6 flex-shrink-0 rounded-card p-4 shadow-inner ${isFullscreen ? 'bg-destructive/20' : 'bg-destructive/10'}`}>
                  <ShieldAlert aria-hidden="true" className={`h-12 w-12 animate-pulse ${isFullscreen ? 'text-red-400' : 'text-destructive'}`} />
                </div>
                <div className="w-full flex-1">
                  <div className="mb-2 flex items-end justify-between">
                    <div>
                      <h2 className={`text-3xl font-black tracking-tight ${isFullscreen ? 'text-red-400 drop-shadow-raised' : 'text-destructive'}`}>
                        ⚠️ 世界BOSS降临: {bigscreenData.activeBoss.name}
                      </h2>
                      <p className={`mt-1 text-sm font-medium ${isFullscreen ? 'text-red-300/80' : 'text-destructive/80'}`}>
                        Lv.{bigscreenData.activeBoss.level} - {bigscreenData.activeBoss.description || '请全班同学前往挑战！'}
                      </p>
                    </div>
                    <div className={`font-mono text-2xl font-black ${isFullscreen ? 'text-red-400' : 'text-destructive'}`}>
                      {bigscreenData.activeBoss.hp} / {bigscreenData.activeBoss.max_hp}
                    </div>
                  </div>
                  {/* HP Bar */}
                  <div className={`h-6 w-full overflow-hidden rounded-full shadow-inner ${isFullscreen ? 'bg-gray-800/80' : 'bg-destructive/20'}`}>
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: `${Math.max(0, (bigscreenData.activeBoss.hp / bigscreenData.activeBoss.max_hp) * 100)}%` }}
                      transition={{ type: 'spring', bounce: 0 }}
                      className="relative h-full overflow-hidden bg-gradient-to-r from-red-500 to-orange-400"
                    >
                      <div className="absolute inset-0 animate-[slideRight_2s_linear_infinite] bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-30"></div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && !bigscreenData ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" label="正在加载大屏数据" />
        </div>
      ) : bigscreenData ? (
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Top Students */}
          <div className={`col-span-1 rounded-panel p-6 lg:col-span-2 ${isFullscreen ? 'bg-gray-800' : 'border border-border bg-paper/80 shadow-card backdrop-blur-xl'}`}>
            <h2 className={`mb-6 flex items-center text-2xl font-bold ${isFullscreen ? 'text-white' : 'text-ink-1'}`}>
              <Award aria-hidden="true" className={`mr-3 h-8 w-8 ${isFullscreen ? 'text-yellow-400' : 'text-yellow-500'}`} />
              积分排行榜 (Top 10)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {bigscreenData.topStudents.map((student: any, index: number) => (
                <div
                  key={student.id}
                  className={`flex items-center rounded-card p-4 ${
                    index === 0 ? 'border border-yellow-200 bg-gradient-to-r from-yellow-100 to-yellow-50' :
                    index === 1 ? 'border border-border bg-gradient-to-r from-gray-200 to-gray-100' :
                    index === 2 ? 'border border-orange-300 bg-gradient-to-r from-orange-200 to-orange-100' :
                    isFullscreen ? 'border border-gray-600 bg-gray-700' : 'border border-border bg-muted/50'
                  }`}
                >
                  <div className={`mr-4 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                    index === 0 ? 'bg-yellow-400 text-white shadow-md' :
                    index === 1 ? 'bg-gray-400 text-white shadow-md' :
                    index === 2 ? 'bg-orange-400 text-white shadow-md' :
                    isFullscreen ? 'bg-gray-600 text-gray-300' : 'bg-paper text-ink-3 shadow-card'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className={`text-lg font-bold ${isFullscreen && index > 2 ? 'text-gray-200' : 'text-ink-1'}`}>
                      {student.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${
                      index === 0 ? 'text-yellow-600' :
                      index === 1 ? 'text-ink-2' :
                      index === 2 ? 'text-orange-600' :
                      isFullscreen ? 'text-green-400' : 'text-primary'
                    }`}>
                      {student.total_points}
                    </div>
                    <div className={`text-xs ${isFullscreen ? 'text-gray-400' : 'text-ink-3'}`}>总积分</div>
                  </div>
                </div>
              ))}
              {bigscreenData.topStudents.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={Award}
                    title="暂无学生数据"
                    description="还没有可展示的积分排行"
                    className={isFullscreen ? 'border-gray-700 bg-gray-800/60' : 'bg-paper'}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Latest Praises */}
            <div className={`rounded-panel p-6 ${isFullscreen ? 'bg-gray-800' : 'border border-border bg-paper/80 shadow-card backdrop-blur-xl'}`}>
              <h2 className={`mb-4 flex items-center text-xl font-bold ${isFullscreen ? 'text-white' : 'text-ink-1'}`}>
                <Star aria-hidden="true" className={`mr-2 h-6 w-6 ${isFullscreen ? 'text-yellow-400' : 'text-yellow-500'}`} />
                最新表扬
              </h2>
              <div className="scrollbar-hide max-h-[300px] space-y-3 overflow-y-auto pr-2">
                {bigscreenData.latestPraises.map((praise: any) => (
                  <div key={praise.id} className={`rounded-card border border-warning/20 p-3 ${praise.color || 'bg-warning/10'}`}>
                    <div className="mb-1 font-bold text-ink-1">{praise.student_name}</div>
                    <div className="text-sm text-ink-2">{praise.content}</div>
                  </div>
                ))}
                {bigscreenData.latestPraises.length === 0 && (
                  <EmptyState
                    icon={Star}
                    title="暂无表扬记录"
                    description="还没有新的表扬"
                    className={isFullscreen ? 'border-gray-700 bg-gray-800/60' : 'bg-paper'}
                  />
                )}
              </div>
            </div>

            {/* Latest Points */}
            <div className={`rounded-panel p-6 ${isFullscreen ? 'bg-gray-800' : 'border border-border bg-paper/80 shadow-card backdrop-blur-xl'}`}>
              <h2 className={`mb-4 flex items-center text-xl font-bold ${isFullscreen ? 'text-white' : 'text-ink-1'}`}>
                <TrendingUp aria-hidden="true" className={`mr-2 h-6 w-6 ${isFullscreen ? 'text-green-400' : 'text-primary'}`} />
                积分动态
              </h2>
              <div className="scrollbar-hide max-h-[300px] space-y-3 overflow-y-auto pr-2">
                {bigscreenData.latestRecords.map((record: any) => (
                  <div key={record.id} className={`flex items-center justify-between rounded-card p-3 ${isFullscreen ? 'bg-gray-700' : 'bg-primary/5'}`}>
                    <div>
                      <span className={`mr-2 font-bold ${isFullscreen ? 'text-gray-200' : 'text-ink-1'}`}>{record.student_name}</span>
                      <span className={`text-sm ${isFullscreen ? 'text-gray-400' : 'text-ink-2'}`}>{record.content}</span>
                    </div>
                    <div className="font-bold text-primary">+{record.amount}</div>
                  </div>
                ))}
                {bigscreenData.latestRecords.length === 0 && (
                  <EmptyState
                    icon={TrendingUp}
                    title="暂无加分记录"
                    description="还没有新的积分动态"
                    className={isFullscreen ? 'border-gray-700 bg-gray-800/60' : 'bg-paper'}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
