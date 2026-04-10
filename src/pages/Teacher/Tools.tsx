import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Dice5, Timer, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';

import { apiGet } from "@/lib/api";

interface Student {
  id: number;
  name: string;
}

interface ClassItem {
  id: number;
  name: string;
}

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
      const data = await apiGet('/api/classes');
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
      const data = await apiGet(`/api/students?classId=${selectedClassId}`);
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
    import('canvas-confetti').then((confetti) => {
      confetti.default({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center space-x-2 overflow-x-auto">
        <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">操作班级:</span>
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClassId(cls.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedClassId === cls.id
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                : 'bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50'
            }`}
          >
            {cls.name}
          </button>
        ))}
        {classes.length === 0 && <span className="text-sm text-gray-400">暂无班级</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Roll Call */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-8 flex flex-col">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mr-3">
              <Dice5 className="w-6 h-6 text-purple-600" />
            </div>
            随机点名
          </h2>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="bg-slate-50/50 border border-gray-200 w-full rounded-2xl h-32 flex items-center justify-center mb-8 shadow-inner">
              <span className="text-4xl font-bold text-slate-800">{rollCallState.currentName}</span>
            </div>
            <div className="flex space-x-4 w-full">
              <button 
                onClick={handleStartRollCall} 
                disabled={rollCallState.isRolling}
                className="flex-1 bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors text-lg shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              >
                开始抽取
              </button>
              <button 
                onClick={handleStopRollCall} 
                disabled={!rollCallState.isRolling}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 transition-colors text-lg shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              >
                停！
              </button>
            </div>
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-8 flex flex-col">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mr-3">
              <Timer className="w-6 h-6 text-blue-600" />
            </div>
            课堂倒计时
          </h2>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="bg-gray-900 border border-gray-800 w-full rounded-2xl h-32 flex items-center justify-center mb-6 shadow-inner">
              <span className="text-6xl font-mono font-bold text-green-400 tracking-wider">
                {formatTime(timerState.timeLeft > 0 ? timerState.timeLeft : timerState.inputMinutes * 60)}
              </span>
            </div>
            
            <div className="flex space-x-2 mb-6 w-full justify-center">
              {[1, 3, 5, 10, 15].map(min => (
                <button 
                  key={min}
                  onClick={() => setTimerState(prev => ({ ...prev, inputMinutes: min, timeLeft: 0, isActive: false }))}
                  disabled={timerState.isActive || timerState.timeLeft > 0}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    timerState.inputMinutes === min 
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' 
                      : 'bg-slate-50/50 text-slate-600 border-2 border-transparent hover:bg-slate-100/50'
                  } disabled:opacity-50`}
                >
                  {min} 分钟
                </button>
              ))}
            </div>

            <div className="flex space-x-4 w-full">
              <button 
                onClick={handleStartTimer} 
                disabled={timerState.isActive}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              >
                {timerState.timeLeft > 0 ? '继续' : '开始计时'}
              </button>
              <button 
                onClick={() => setTimerState(prev => ({ ...prev, isActive: false }))} 
                disabled={!timerState.isActive}
                className="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-bold hover:bg-yellow-600 disabled:opacity-50 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              >
                暂停
              </button>
              <button 
                onClick={() => setTimerState(prev => ({ ...prev, isActive: false, timeLeft: 0 }))} 
                className="flex-1 bg-slate-100/50 text-slate-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                重置
              </button>
            </div>
          </div>
        </div>

        {/* Stopwatch */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-8 flex flex-col">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mr-3">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            正向计时器
          </h2>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="bg-gray-900 border border-gray-800 w-full rounded-2xl h-32 flex items-center justify-center mb-8 shadow-inner">
              <span className="text-6xl font-mono font-bold text-orange-400 tracking-wider">
                {formatTime(stopwatchState.time)}
              </span>
            </div>
            
            <div className="flex space-x-4 w-full">
              <button 
                onClick={() => setStopwatchState(prev => ({ ...prev, isActive: !prev.isActive }))}
                className={`flex-1 text-white py-3 rounded-xl font-bold transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] ${
                  stopwatchState.isActive ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {stopwatchState.isActive ? '暂停计时' : (stopwatchState.time > 0 ? '继续计时' : '开始计时')}
              </button>
              <button 
                onClick={() => setStopwatchState({ time: 0, isActive: false })} 
                className="flex-1 bg-slate-100/50 text-slate-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                归零
              </button>
            </div>
          </div>
        </div>

        {/* Group Generator */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-8 flex flex-col">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center mr-3">
              <Users className="w-6 h-6 text-teal-600" />
            </div>
            随机分组
          </h2>
          <div className="flex-1 flex flex-col">
            <div className="flex items-center space-x-4 mb-6">
              <span className="text-sm font-medium text-slate-700">分成几组:</span>
              <input
                type="number"
                min="2"
                max="10"
                value={groupCount}
                onChange={(e) => setGroupCount(parseInt(e.target.value) || 2)}
                className="w-20 border border-gray-300 rounded-xl px-3 py-2 text-center focus:ring-teal-500 focus:border-teal-500"
              />
              <button
                onClick={handleGenerateGroups}
                className="flex-1 bg-teal-500 text-white py-2 rounded-xl font-bold hover:bg-teal-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              >
                一键分组
              </button>
            </div>

            {generatedGroups.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                {generatedGroups.map((group, index) => (
                  <div key={index} className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                    <div className="text-xs font-bold text-teal-700 mb-2 border-b border-teal-200 pb-1">第 {index + 1} 组 ({group.length}人)</div>
                    <div className="text-sm text-slate-700 flex flex-wrap gap-1">
                      {group.map(s => (
                        <span key={s.id} className="bg-white/80 backdrop-blur-xl px-1.5 py-0.5 rounded text-xs border border-white/60">{s.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-slate-50/50 text-gray-400 text-sm">
                点击上方按钮生成随机小组
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
