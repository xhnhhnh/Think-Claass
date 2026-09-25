import { useState, useEffect } from 'react';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { useStore } from '@/store/useStore';
import { Maximize, Users, Award, Star, TrendingUp, ShieldAlert, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import DanmakuOverlay from '@/components/DanmakuOverlay';
import ClassFeaturePanel from '@/pages/Teacher/components/ClassFeaturePanel';

import { classroomApi } from '@/features/classroom/api/classesApi';
import { useResolvedClassFeatures } from '@/features/classroom/hooks/useResolvedClassFeatures';
import { launchConfetti } from '@/lib/confetti';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
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
 * the *palette and the radii* - the indigo/violet utilities, the previous backdrop
 * literal and the arbitrary glow shadows are gone - while the layout, the oversized
 * type, the dark fullscreen stage, the confetti and the HP-bar animation stay exactly
 * as they were. Card-ifying it would trade a readable-from-the-back-of-the-room screen
 * for a console.
 *
 * Two consequences of staying dark, both deliberate:
 *   - Controls that only render inside the fullscreen stage keep a dark surface and
 *     pass it through `className`, because the kit's light default is unreadable
 *     there. Controls on the light (non-fullscreen) shell use the kit's own variants.
 *   - The countdown readout is a `<button>`, not a kit `Button`: in the stage it is a
 *     3xl/5xl instrument readout, and the kit sizes a control to 2.25rem. It is the
 *     one raw button the UI audit still reports, by name.
 *
 * The stage is `variant="immersive"`: the route already renders it without the
 * workbench chrome, and the scaffold contributes only the full-bleed canvas.
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
  const { features: classFeatures } = useResolvedClassFeatures(selectedClassId);

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

  // The stage's main control, reachable from the command palette too.
  useRegisterPageCommands([
    {
      id: 'teacher-bigscreen:toggle-fullscreen',
      label: isFullscreen ? '退出大屏' : '进入大屏模式',
      icon: Maximize,
      keywords: ['大屏', '投影', '全屏'],
      run: toggleFullscreen,
    },
  ]);

  if (!classes.length) {
    return <PageScaffold variant="immersive" className="p-8 text-center text-fg-3">暂无班级数据，请先创建班级。</PageScaffold>;
  }

  const isBossActive = classFeatures.enable_world_boss && bigscreenData?.activeBoss && bigscreenData.activeBoss.hp > 0;

  return (
    <PageScaffold
      variant="immersive"
      className={`flex h-full flex-col ${isFullscreen ? 'fixed inset-0 z-50 overflow-y-auto bg-fg-1 p-8 text-fg-inverse' : 'space-y-6'}`}
    >
      {selectedClassId && classFeatures.enable_danmaku ? <DanmakuOverlay classId={selectedClassId} /> : null}
      {/* Background Particles for Fullscreen */}
      {isFullscreen && (
        <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden bg-surface-1">
          <div className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full bg-role/20 mix-blend-screen blur-[120px]"></div>
          <div className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-role-soft/30 mix-blend-screen blur-[120px] [animation-delay:2s]"></div>
          <div className={`absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px] mix-blend-screen transition-all duration-1000 ${isBossActive ? 'animate-pulse bg-danger/30' : 'bg-transparent'}`}></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
        </div>
      )}
      {!isFullscreen && (
        <div className="flex items-center justify-between rounded-card border border-line-1 bg-surface-2/80 p-4 shadow-card backdrop-blur-xl">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="mr-2 flex-shrink-0 text-sm font-bold text-fg-3">选择班级:</span>
            {classes.map((cls) => (
              <Button
                key={cls.id}
                type="button"
                onClick={() => setSelectedClassId(cls.id)}
                className={cn(
                  'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  selectedClassId === cls.id
                    ? 'bg-gradient-to-r from-role to-role-ink text-role-contrast shadow-card'
                    : 'border border-line-1 bg-surface-3/50 text-fg-2 hover:bg-surface-3/50',
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
        <div className="rounded-card border border-line-1 bg-surface-2/80 p-5 shadow-card backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-fg-1">大屏功能摘要</h2>
              <p className="text-sm text-fg-3">关闭弹幕后将停止展示课堂弹幕，关闭世界 Boss 后大屏也会同步隐藏相关区块</p>
            </div>
          </div>
          <ClassFeaturePanel classId={selectedClassId} compact />
        </div>
      )}

      {isFullscreen && (
        <div className="relative z-10 mb-8 flex items-center justify-between">
          <h1 className="bg-gradient-to-r from-role to-role-ink bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-raised">
            {bigscreenData?.class?.name} <span className="font-normal text-fg-3">|</span> 光荣榜
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
                      ? 'animate-pulse border-danger/50 bg-danger/20 text-danger'
                      : 'border-role/50 bg-role/20 text-role-contrast hover:bg-role/30'
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
                  className="h-auto rounded-card border border-line-1 bg-surface-2/80 px-6 py-3 font-bold text-fg-2 backdrop-blur-md hover:bg-surface-3/80 hover:text-fg-1"
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
                    className="absolute right-0 top-full z-50 mt-4 w-64 rounded-card border border-line-1 bg-surface-2 p-4 shadow-floating backdrop-blur-xl"
                  >
                    <label htmlFor="countdown-minutes" className="mb-2 block text-sm font-medium text-fg-3">设置倒计时 (分钟)</label>
                    <div className="flex space-x-2">
                      <Input
                        id="countdown-minutes"
                        type="number"
                        value={countdownInput}
                        onChange={e => setCountdownInput(e.target.value)}
                        className="h-auto flex-1 rounded-card border-line-1 bg-surface-1 px-3 py-2 font-mono text-lg text-fg-1 focus-visible:border-role"
                        min="1"
                      />
                      <Button
                        type="button"
                        onClick={startCountdown}
                        className="h-auto rounded-card bg-role px-4 py-2 font-bold text-role-contrast hover:bg-role/90"
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
                          className="h-auto rounded-card bg-surface-3 py-1.5 text-sm font-normal text-fg-2 hover:bg-surface-steel hover:text-fg-1"
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
              className="h-auto rounded-card border border-line-1 bg-surface-2/80 px-6 py-3 text-sm font-bold text-fg-2 backdrop-blur-md hover:bg-surface-3/80 hover:text-fg-1"
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
              isFullscreen ? 'border-2 border-danger/50 bg-surface-2/80 backdrop-blur-xl' : 'border border-danger/30 bg-danger/10'
            }`}
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 mix-blend-overlay"></div>
            <div className="relative flex flex-col items-center justify-between gap-8 p-8 md:flex-row">
              <div className="flex w-full flex-1 items-center">
                <div className={`mr-6 flex-shrink-0 rounded-card p-4 shadow-inner ${isFullscreen ? 'bg-danger/20' : 'bg-danger/10'}`}>
                  <ShieldAlert aria-hidden="true" className="h-12 w-12 animate-pulse text-danger" />
                </div>
                <div className="w-full flex-1">
                  <div className="mb-2 flex items-end justify-between">
                    <div>
                      <h2 className={`text-3xl font-black tracking-tight text-danger ${isFullscreen ? 'drop-shadow-raised' : ''}`}>
                        ⚠️ 世界BOSS降临: {bigscreenData.activeBoss.name}
                      </h2>
                      <p className="mt-1 text-sm font-medium text-danger/80">
                        Lv.{bigscreenData.activeBoss.level} - {bigscreenData.activeBoss.description || '请全班同学前往挑战！'}
                      </p>
                    </div>
                    <div className="font-mono text-2xl font-black text-danger">
                      {bigscreenData.activeBoss.hp} / {bigscreenData.activeBoss.max_hp}
                    </div>
                  </div>
                  {/* HP Bar */}
                  <div className={`h-6 w-full overflow-hidden rounded-full shadow-inner ${isFullscreen ? 'bg-surface-3/80' : 'bg-danger/20'}`}>
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: `${Math.max(0, (bigscreenData.activeBoss.hp / bigscreenData.activeBoss.max_hp) * 100)}%` }}
                      transition={{ type: 'spring', bounce: 0 }}
                      className="relative h-full overflow-hidden bg-gradient-to-r from-danger to-warning"
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
          <div className={`col-span-1 rounded-panel p-6 lg:col-span-2 ${isFullscreen ? 'bg-surface-2' : 'border border-line-1 bg-surface-2/80 shadow-card backdrop-blur-xl'}`}>
            <h2 className={`mb-6 flex items-center text-2xl font-bold ${isFullscreen ? 'text-fg-inverse' : 'text-fg-1'}`}>
              <Award aria-hidden="true" className="mr-3 h-8 w-8 text-warning" />
              积分排行榜 (Top 10)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {bigscreenData.topStudents.map((student: any, index: number) => (
                <div
                  key={student.id}
                  className={`flex items-center rounded-card p-4 ${
                    index === 0 ? 'border border-warning/30 bg-gradient-to-r from-warning-soft to-surface-2' :
                    index === 1 ? 'border border-line-1 bg-gradient-to-r from-surface-steel to-surface-3' :
                    index === 2 ? 'border border-warning/40 bg-gradient-to-r from-warning/20 to-warning-soft' :
                    isFullscreen ? 'border border-line-strong bg-surface-3' : 'border border-line-1 bg-surface-3/50'
                  }`}
                >
                  <div className={`mr-4 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                    index === 0 ? 'bg-warning text-fg-inverse shadow-md' :
                    index === 1 ? 'bg-line-strong text-fg-inverse shadow-md' :
                    index === 2 ? 'bg-warning/80 text-fg-inverse shadow-md' :
                    isFullscreen ? 'bg-surface-steel text-fg-2' : 'bg-surface-2 text-fg-3 shadow-card'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-bold text-fg-1">
                      {student.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${
                      index === 0 ? 'text-warning-ink' :
                      index === 1 ? 'text-fg-2' :
                      index === 2 ? 'text-warning' :
                      isFullscreen ? 'text-success' : 'text-role'
                    }`}>
                      {student.total_points}
                    </div>
                    <div className="text-xs text-fg-3">总积分</div>
                  </div>
                </div>
              ))}
              {bigscreenData.topStudents.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={Award}
                    title="暂无学生数据"
                    description="还没有可展示的积分排行"
                    className={isFullscreen ? 'border-line-1 bg-surface-2/60' : 'bg-surface-2'}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Latest Praises */}
            <div className={`rounded-panel p-6 ${isFullscreen ? 'bg-surface-2' : 'border border-line-1 bg-surface-2/80 shadow-card backdrop-blur-xl'}`}>
              <h2 className={`mb-4 flex items-center text-xl font-bold ${isFullscreen ? 'text-fg-inverse' : 'text-fg-1'}`}>
                <Star aria-hidden="true" className="mr-2 h-6 w-6 text-warning" />
                最新表扬
              </h2>
              <div className="scrollbar-hide max-h-[300px] space-y-3 overflow-y-auto pr-2">
                {bigscreenData.latestPraises.map((praise: any) => (
                  <div key={praise.id} className={`rounded-card border border-warning/20 p-3 ${praise.color || 'bg-warning/10'}`}>
                    <div className="mb-1 font-bold text-fg-1">{praise.student_name}</div>
                    <div className="text-sm text-fg-2">{praise.content}</div>
                  </div>
                ))}
                {bigscreenData.latestPraises.length === 0 && (
                  <EmptyState
                    icon={Star}
                    title="暂无表扬记录"
                    description="还没有新的表扬"
                    className={isFullscreen ? 'border-line-1 bg-surface-2/60' : 'bg-surface-2'}
                  />
                )}
              </div>
            </div>

            {/* Latest Points */}
            <div className={`rounded-panel p-6 ${isFullscreen ? 'bg-surface-2' : 'border border-line-1 bg-surface-2/80 shadow-card backdrop-blur-xl'}`}>
              <h2 className={`mb-4 flex items-center text-xl font-bold ${isFullscreen ? 'text-fg-inverse' : 'text-fg-1'}`}>
                <TrendingUp aria-hidden="true" className={`mr-2 h-6 w-6 ${isFullscreen ? 'text-success' : 'text-role'}`} />
                积分动态
              </h2>
              <div className="scrollbar-hide max-h-[300px] space-y-3 overflow-y-auto pr-2">
                {bigscreenData.latestRecords.map((record: any) => (
                  <div key={record.id} className={`flex items-center justify-between rounded-card p-3 ${isFullscreen ? 'bg-surface-3' : 'bg-role/5'}`}>
                    <div>
                      <span className="mr-2 font-bold text-fg-1">{record.student_name}</span>
                      <span className={`text-sm ${isFullscreen ? 'text-fg-3' : 'text-fg-2'}`}>{record.content}</span>
                    </div>
                    <div className="font-bold text-role">+{record.amount}</div>
                  </div>
                ))}
                {bigscreenData.latestRecords.length === 0 && (
                  <EmptyState
                    icon={TrendingUp}
                    title="暂无加分记录"
                    description="还没有新的积分动态"
                    className={isFullscreen ? 'border-line-1 bg-surface-2/60' : 'bg-surface-2'}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageScaffold>
  );
}
