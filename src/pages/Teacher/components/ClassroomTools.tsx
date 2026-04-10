import { useState, useEffect, useRef } from 'react';
import { Dice5, Timer } from 'lucide-react';
import { toast } from 'sonner';

export function ClassroomTools({ students }: { students: { id: number; name: string }[] }) {
  const [rollCallState, setRollCallState] = useState({ isRolling: false, currentName: '点击开始' });
  const rollIntervalRef = useRef<any>(null);

  const [timerState, setTimerState] = useState({ timeLeft: 0, isActive: false, inputMinutes: 5 });

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

  const handleStartRollCall = () => {
    if (students.length === 0) {
      toast.error('当前没有学生可以点名');
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

  const formatTimer = (seconds: number) => {
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
    import('canvas-confetti').then((confetti) => {
      confetti.default({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-4 border border-indigo-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden">
        <Dice5 className="absolute -right-4 -bottom-4 w-24 h-24 text-indigo-100/50" />
        <h4 className="text-sm font-bold text-slate-500 mb-2 relative z-10">随机点名</h4>
        <div className="text-2xl font-black text-indigo-600 mb-4 relative z-10">
          {rollCallState.currentName}
        </div>
        <button
          onClick={rollCallState.isRolling ? handleStopRollCall : handleStartRollCall}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all relative z-10 shadow-[0_2px_12px_rgba(0,0,0,0.03)] ${
            rollCallState.isRolling 
              ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg'
          }`}
        >
          {rollCallState.isRolling ? '停！' : '开始抽取'}
        </button>
      </div>

      <div className="bg-gradient-to-br from-cyan-50 to-white rounded-2xl p-4 border border-cyan-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden">
        <Timer className="absolute -right-4 -bottom-4 w-24 h-24 text-cyan-100/50" />
        <h4 className="text-sm font-bold text-slate-500 mb-2 relative z-10">课堂倒计时</h4>
        <div className="text-3xl font-black text-cyan-600 mb-4 tracking-wider font-mono relative z-10">
          {formatTimer(timerState.timeLeft)}
        </div>
        <div className="flex space-x-2 relative z-10">
          {!timerState.isActive && timerState.timeLeft === 0 ? (
            <>
              <input 
                type="number" 
                min="1" 
                max="60"
                value={timerState.inputMinutes}
                onChange={(e) => setTimerState(prev => ({ ...prev, inputMinutes: parseInt(e.target.value) || 1 }))}
                className="w-16 px-2 py-1.5 text-center border border-cyan-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none font-medium"
              />
              <span className="text-slate-500 self-center text-sm font-medium mr-1">分钟</span>
            </>
          ) : null}
          <button
            onClick={() => {
              if (timerState.isActive) {
                setTimerState(prev => ({ ...prev, isActive: false }));
              } else {
                handleStartTimer();
              }
            }}
            className="px-5 py-2 bg-cyan-600 text-white rounded-xl text-sm font-bold hover:bg-cyan-700 transition-colors shadow-md hover:shadow-lg"
          >
            {timerState.isActive ? '暂停' : (timerState.timeLeft > 0 ? '继续' : '开始')}
          </button>
          {timerState.timeLeft > 0 && (
            <button
              onClick={() => setTimerState(prev => ({ ...prev, timeLeft: 0, isActive: false }))}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors"
            >
              重置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
