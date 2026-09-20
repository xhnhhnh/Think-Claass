import { useState, useEffect, useRef } from 'react';
import { Dice5, Timer, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';

import { classroomApi } from '@/features/classroom/api/classesApi';
import { studentsApi } from '@/features/classroom/api/studentsApi';
import { launchConfetti } from '@/lib/confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

interface Student {
  id: number;
  name: string;
}

interface ClassItem {
  id: number;
  name: string;
}

/**
 * 教学工具.
 *
 * Four independent widgets (roll call, countdown, stopwatch, group generator) that
 * each hand-built the same card, the same tinted icon block and the same solid
 * button in a different hard-coded palette - purple, blue, orange, teal. The tints
 * are the kit's tone tokens now, and the digits keep their dark instrument panel:
 * that contrast is what makes a 6xl monospace number readable from the back of a
 * classroom, so it is the one deliberate survivor of the old styling.
 *
 * Timers, intervals, confetti and every toast string are unchanged.
 */
export default function TeacherTools() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  // Roll Call State
  const [rollCallState, setRollCallState] = useState({ isRolling: false, currentName: '点击开始' });
  const rollIntervalRef = useRef<any>(null);

  // Timer State
  const [timerState, setTimerState] = useState({ timeLeft: 0, isActive: false, inputMinutes: 5 });

  // Stopwatch State
  const [stopwatchState, setStopwatchState] = useState({ time: 0, isActive: false });

  // Group Generator State
  const [groupCount, setGroupCount] = useState(4);
  const [generatedGroups, setGeneratedGroups] = useState<Student[][]>([]);

  useEffect(() => {
    fetchClasses();
  }, []);

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
      fetchStudents();
    }
  }, [selectedClassId]);

  const fetchStudents = async () => {
    try {
      const data = await studentsApi.getStudents(selectedClassId);
      if (data.success) {
        setStudents(data.students);
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    }
  };

  // Timer logic
  useEffect(() => {
    let interval: any = null;
    if (timerState.isActive && timerState.timeLeft > 0) {
      interval = setInterval(() => {
        setTimerState(prev => ({ ...prev, timeLeft: prev.timeLeft - 1 }));
      }, 1000);
    } else if (timerState.isActive && timerState.timeLeft === 0) {
      setTimerState(prev => ({ ...prev, isActive: false }));
      toast.success('⏰ 倒计时结束！', { duration: 5000, position: 'top-center' });
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timerState.isActive, timerState.timeLeft]);

  // Stopwatch logic
  useEffect(() => {
    let interval: any = null;
    if (stopwatchState.isActive) {
      interval = setInterval(() => {
        setStopwatchState(prev => ({ ...prev, time: prev.time + 1 }));
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [stopwatchState.isActive]);

  const handleStartRollCall = () => {
    if (students.length === 0) {
      toast.error('当前班级没有学生');
      return;
    }
    if (rollCallState.isRolling) return;

    setRollCallState({ isRolling: true, currentName: '...' });
    rollIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * students.length);
      setRollCallState(prev => ({ ...prev, currentName: students[randomIndex].name }));
    }, 50);
  };

  const handleStopRollCall = () => {
    if (!rollCallState.isRolling) return;
    clearInterval(rollIntervalRef.current);
    setRollCallState(prev => ({ ...prev, isRolling: false }));
    triggerConfetti();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStartTimer = () => {
    if (timerState.timeLeft === 0) {
      setTimerState(prev => ({ ...prev, timeLeft: prev.inputMinutes * 60, isActive: true }));
    } else {
      setTimerState(prev => ({ ...prev, isActive: true }));
    }
  };

  const triggerConfetti = () => {
    void launchConfetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleGenerateGroups = () => {
    if (students.length === 0) {
      toast.error('当前班级没有学生');
      return;
    }

    // Shuffle students
    const shuffled = [...students].sort(() => 0.5 - Math.random());
    const groups: Student[][] = Array.from({ length: groupCount }, () => []);

    shuffled.forEach((student, index) => {
      groups[index % groupCount].push(student);
    });

    setGeneratedGroups(groups);
    triggerConfetti();
  };

  /** The tinted 10×10 icon block each widget's heading opens with. */
  const widgetIcon = (Icon: typeof Dice5, tint: string) => (
    <span className={cn('mr-3 flex h-10 w-10 items-center justify-center rounded-card', tint)}>
      <Icon aria-hidden="true" className="h-6 w-6" />
    </span>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="教学工具"
        description="随机点名、课堂倒计时、正向计时与随机分组"
        icon={Dice5}
      />

      <div className="flex items-center space-x-2 overflow-x-auto rounded-card border border-border bg-paper/80 p-4 shadow-card backdrop-blur-xl">
        <span className="mr-2 flex-shrink-0 text-sm font-bold text-ink-3">操作班级:</span>
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
        {classes.length === 0 && <span className="text-sm text-ink-3">暂无班级</span>}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Roll Call */}
        <Card className="flex flex-col rounded-panel">
          <CardContent className="flex flex-1 flex-col p-8">
            <h2 className="mb-6 flex items-center text-xl font-bold text-ink-1">
              {widgetIcon(Dice5, 'bg-accent text-accent-foreground')}
              随机点名
            </h2>
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="mb-8 flex h-32 w-full items-center justify-center rounded-card border border-border bg-muted/50 shadow-inner">
                <span className="text-4xl font-bold text-ink-1">{rollCallState.currentName}</span>
              </div>
              <div className="flex w-full space-x-4">
                <Button
                  type="button"
                  onClick={handleStartRollCall}
                  disabled={rollCallState.isRolling}
                  className="h-auto flex-1 rounded-card bg-primary py-3 text-lg font-bold text-primary-foreground hover:bg-primary/90"
                >
                  开始抽取
                </Button>
                <Button
                  type="button"
                  onClick={handleStopRollCall}
                  disabled={!rollCallState.isRolling}
                  className="h-auto flex-1 rounded-card bg-destructive py-3 text-lg font-bold text-destructive-foreground hover:bg-destructive/90"
                >
                  停！
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Countdown Timer */}
        <Card className="flex flex-col rounded-panel">
          <CardContent className="flex flex-1 flex-col p-8">
            <h2 className="mb-6 flex items-center text-xl font-bold text-ink-1">
              {widgetIcon(Timer, 'bg-info/10 text-info')}
              课堂倒计时
            </h2>
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="mb-6 flex h-32 w-full items-center justify-center rounded-card border border-border bg-gray-900 shadow-inner">
                <span className="font-mono text-6xl font-bold tracking-wider text-green-400">
                  {formatTime(timerState.timeLeft > 0 ? timerState.timeLeft : timerState.inputMinutes * 60)}
                </span>
              </div>

              <div className="mb-6 flex w-full justify-center space-x-2">
                {[1, 3, 5, 10, 15].map(min => (
                  <Button
                    key={min}
                    type="button"
                    onClick={() => setTimerState(prev => ({ ...prev, inputMinutes: min, timeLeft: 0, isActive: false }))}
                    disabled={timerState.isActive || timerState.timeLeft > 0}
                    className={cn(
                      'h-auto rounded-card border-2 px-4 py-2 text-sm font-bold transition-colors',
                      timerState.inputMinutes === min
                        ? 'border-info bg-info/10 text-info hover:bg-info/10'
                        : 'border-transparent bg-muted/50 text-ink-2 hover:bg-muted/50',
                    )}
                  >
                    {min} 分钟
                  </Button>
                ))}
              </div>

              <div className="flex w-full space-x-4">
                <Button
                  type="button"
                  onClick={handleStartTimer}
                  disabled={timerState.isActive}
                  className="h-auto flex-1 rounded-card bg-info py-3 font-bold text-info-foreground hover:bg-info/90"
                >
                  {timerState.timeLeft > 0 ? '继续' : '开始计时'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setTimerState(prev => ({ ...prev, isActive: false }))}
                  disabled={!timerState.isActive}
                  className="h-auto flex-1 rounded-card bg-warning py-3 font-bold text-warning-foreground hover:bg-warning/90"
                >
                  暂停
                </Button>
                <Button
                  type="button"
                  onClick={() => setTimerState(prev => ({ ...prev, isActive: false, timeLeft: 0 }))}
                  variant="secondary"
                  className="h-auto flex-1 rounded-card py-3 font-bold"
                >
                  重置
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stopwatch */}
        <Card className="flex flex-col rounded-panel">
          <CardContent className="flex flex-1 flex-col p-8">
            <h2 className="mb-6 flex items-center text-xl font-bold text-ink-1">
              {widgetIcon(Clock, 'bg-warning/10 text-warning')}
              正向计时器
            </h2>
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="mb-8 flex h-32 w-full items-center justify-center rounded-card border border-border bg-gray-900 shadow-inner">
                <span className="font-mono text-6xl font-bold tracking-wider text-orange-400">
                  {formatTime(stopwatchState.time)}
                </span>
              </div>

              <div className="flex w-full space-x-4">
                <Button
                  type="button"
                  onClick={() => setStopwatchState(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className={cn(
                    'h-auto flex-1 rounded-card font-bold text-white',
                    stopwatchState.isActive ? 'bg-warning hover:bg-warning/90' : 'bg-orange-500 hover:bg-orange-600',
                  )}
                >
                  {stopwatchState.isActive ? '暂停计时' : (stopwatchState.time > 0 ? '继续计时' : '开始计时')}
                </Button>
                <Button
                  type="button"
                  onClick={() => setStopwatchState({ time: 0, isActive: false })}
                  variant="secondary"
                  className="h-auto flex-1 rounded-card py-3 font-bold"
                >
                  归零
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Group Generator */}
        <Card className="flex flex-col rounded-panel">
          <CardContent className="flex flex-1 flex-col p-8">
            <h2 className="mb-6 flex items-center text-xl font-bold text-ink-1">
              {widgetIcon(Users, 'bg-success/10 text-success')}
              随机分组
            </h2>
            <div className="flex flex-1 flex-col">
              <div className="mb-6 flex items-end space-x-4">
                <FormField label="分成几组:" inline className="shrink-0">
                  <Input
                    id="group-count"
                    type="number"
                    min="2"
                    max="10"
                    value={groupCount}
                    onChange={(e) => setGroupCount(parseInt(e.target.value) || 2)}
                    className="w-20 text-center"
                  />
                </FormField>
                <Button
                  type="button"
                  onClick={handleGenerateGroups}
                  className="h-auto flex-1 self-end rounded-card bg-primary py-2 font-bold text-primary-foreground hover:bg-primary/90"
                >
                  一键分组
                </Button>
              </div>

              {generatedGroups.length > 0 ? (
                <div className="scrollbar-hide grid max-h-48 grid-cols-2 gap-3 overflow-y-auto pr-2">
                  {generatedGroups.map((group, index) => (
                    <div key={index} className="rounded-card border border-success/20 bg-success/10 p-3">
                      <div className="mb-2 border-b border-success/20 pb-1 text-xs font-bold text-success">
                        第 {index + 1} 组 ({group.length}人)
                      </div>
                      <div className="flex flex-wrap gap-1 text-sm text-ink-2">
                        {group.map(s => (
                          <span key={s.id} className="rounded border border-border bg-paper px-1.5 py-0.5 text-xs">{s.name}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-card border-2 border-dashed border-border bg-muted/50 text-sm text-ink-3">
                  点击上方按钮生成随机小组
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
