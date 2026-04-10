import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle, Clock, Star, TrendingUp, AlertCircle, ChevronRight, Heart, Sparkles, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

import { apiGet, apiPost } from "@/lib/api";

interface StudentInfo {
  id: number;
  name: string;
  total_points: number;
  available_points: number;
  class_id: number;
  group_name?: string;
}

interface Record {
  id: number;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

interface FamilyTask {
  id: number;
  title: string;
  points: number;
  status: string;
}

export const getRankTier = (points: number) => {
  const level = Math.floor(points / 100) + 1;
  const tiers = ['青铜', '白银', '黄金', '铂金', '钻石', '战神'];
  const tierIndex = Math.min(Math.floor((level - 1) / 5), 5);
  return `${tiers[tierIndex]} Lv.${level}`;
};

export default function ParentDashboard() {
  const user = useStore(state => state.user);
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [buffActive, setBuffActive] = useState(false);
  const [buffLoading, setBuffLoading] = useState(false);

  useEffect(() => {
    if (!user?.studentId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [studentData, recordsData, tasksData, petData] = await Promise.all([
          apiGet(`/api/student/${user.studentId}`),
          apiGet(`/api/student/records?studentId=${user.studentId}`),
          apiGet(`/api/familyTasks?studentId=${user.studentId}`),
          apiGet(`/api/pets/${user.studentId}`)
        ]);

        if (studentData.success) setStudent(studentData.student);
        if (recordsData.success) setRecords(recordsData.records.slice(0, 5));
        if (tasksData.success) setTasks(tasksData.tasks.slice(0, 5));
        if (petData.success) setBuffActive(petData.pet.has_parent_buff);
      } catch (error) {
        toast.error('加载数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.studentId]);

  const castParentBuff = async () => {
    if (buffActive) {
      toast.info('今日已经施放过祝福啦！');
      return;
    }
    setBuffLoading(true);
    try {
      const data = await apiPost(`/api/parent-buff`, { studentId: user?.studentId });
      if (data.success) {
        setBuffActive(true);
        toast.success('✨ 母爱的祝福已施放！');
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#fb923c']
        });
      } else {
        toast.error(data.message || '施放失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setBuffLoading(false);
    }
  };

  if (!user?.studentId) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 p-8 text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <Heart className="w-10 h-10 text-coral-400" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-3">等待宝贝加入</h2>
        <p className="text-stone-500 max-w-md">
          您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center items-center h-64 text-stone-400 font-medium">翻阅日记中...</div>;
  }

  const pendingTasksCount = tasks.filter(t => t.status === 'pending' || t.status === 'completed').length;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-stone-800">温馨家园</h1>
        <p className="text-stone-500">记录宝贝的每一天</p>
      </div>

      {student && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-coral-400 via-coral-300 to-amber-300 rounded-[2rem] p-8 text-white shadow-lg shadow-coral-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
              <Star className="w-64 h-64" />
            </div>
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <h2 className="text-4xl font-bold mb-3">{student.name}</h2>
                <div className="flex items-center space-x-4 mt-5">
                  <div className="bg-white/20 px-5 py-2.5 rounded-2xl backdrop-blur-md border border-white/20">
                    <p className="text-amber-50 text-sm font-medium">成长足迹</p>
                    <p className="font-bold text-xl">{getRankTier(student.total_points)}</p>
                  </div>
                  <div className="bg-white/20 px-5 py-2.5 rounded-2xl backdrop-blur-md border border-white/20">
                    <p className="text-amber-50 text-sm font-medium">伙伴小队</p>
                    <p className="font-bold text-xl">{student.group_name || '探索中'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/20 pt-6">
              <div>
                <p className="text-amber-50 mb-1 font-medium">获得小红花</p>
                <p className="text-4xl font-bold">{student.total_points}</p>
              </div>
              <div>
                <p className="text-amber-50 mb-1 font-medium">可用小红花</p>
                <p className="text-4xl font-bold text-amber-100">{student.available_points}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 flex flex-col justify-between hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold text-stone-800 flex items-center">
                  <div className="w-10 h-10 bg-green-50 rounded-2xl flex items-center justify-center mr-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  家庭时光
                </h3>
              </div>
              <p className="text-stone-500 text-sm mb-5 leading-relaxed">
                陪伴是最长情的告白，和宝贝一起完成有趣的家庭小任务吧。
              </p>
              <div className="bg-amber-50/50 rounded-2xl p-4 flex items-center justify-between border border-amber-100/50">
                <span className="text-amber-800 font-medium">等待您查收</span>
                <span className="bg-coral-400 text-white px-3 py-1 rounded-xl text-sm font-bold shadow-sm">
                  {pendingTasksCount}
                </span>
              </div>
            </div>
            
            <div className="mt-6 space-y-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={castParentBuff}
                disabled={buffActive || buffLoading}
                className={`w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl font-bold transition-all shadow-md ${
                  buffActive 
                    ? 'bg-amber-100 text-amber-500 cursor-not-allowed border border-amber-200' 
                    : 'bg-gradient-to-r from-amber-400 to-orange-400 text-white hover:shadow-lg hover:shadow-orange-400/30'
                }`}
              >
                <Wand2 className="w-5 h-5" />
                <span>{buffActive ? '今日祝福已送达' : '施放母爱的祝福 (+20%积分)'}</span>
              </motion.button>
              
              <button
                onClick={() => navigate('/parent/tasks')}
                className="w-full flex items-center justify-center space-x-2 bg-stone-50 hover:bg-stone-100 text-stone-700 py-3.5 rounded-2xl font-medium transition-colors"
              >
                <span>查看家庭任务</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* 近期记录 */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 p-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-stone-800 flex items-center">
              <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center mr-3">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
              </div>
              闪光时刻
            </h3>
            <button 
              onClick={() => navigate('/parent/report')}
              className="text-sm text-indigo-500 hover:text-indigo-600 font-medium px-3 py-1.5 bg-indigo-50/50 rounded-xl transition-colors"
            >
              完整足迹
            </button>
          </div>
          <div className="space-y-4">
            {records.length > 0 ? (
              records.map(record => (
                <div key={record.id} className="flex items-center justify-between p-4 bg-stone-50/50 hover:bg-stone-50 rounded-2xl transition-colors border border-transparent hover:border-stone-100">
                  <div className="flex items-center">
                    <div className={`p-2.5 rounded-xl mr-4 ${record.amount > 0 ? 'bg-green-100 text-green-600' : 'bg-coral-100 text-coral-600'}`}>
                      {record.amount > 0 ? <Star className="w-5 h-5" /> : <TrendingUp className="w-5 h-5 transform rotate-180" />}
                    </div>
                    <div>
                      <p className="font-medium text-stone-800">{record.description}</p>
                      <p className="text-xs text-stone-400 mt-1.5">
                        {new Date(record.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`font-bold text-lg ${record.amount > 0 ? 'text-green-500' : 'text-coral-500'}`}>
                    {record.amount > 0 ? '+' : ''}{record.amount}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 bg-stone-50/50 rounded-2xl border border-dashed border-stone-200">
                <p className="text-stone-400">还没有新的记录哦</p>
              </div>
            )}
          </div>
        </div>

        {/* 近期任务 */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 p-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-stone-800 flex items-center">
              <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center mr-3">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              最近的约定
            </h3>
            <button 
              onClick={() => navigate('/parent/tasks')}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium px-3 py-1.5 bg-amber-50/50 rounded-xl transition-colors"
            >
              所有约定
            </button>
          </div>
          <div className="space-y-4">
            {tasks.length > 0 ? (
              tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-4 bg-stone-50/50 hover:bg-stone-50 rounded-2xl transition-colors border border-transparent hover:border-stone-100">
                  <div>
                    <h4 className="font-medium text-stone-800">{task.title}</h4>
                    <div className="flex items-center mt-2.5 space-x-2">
                      <span className="text-xs font-medium px-2.5 py-1 bg-amber-100/50 text-amber-700 rounded-lg border border-amber-200/50">
                        {task.points} 朵小红花
                      </span>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${
                        task.status === 'pending' ? 'bg-stone-100/50 text-stone-600 border-stone-200/50' :
                        task.status === 'completed' ? 'bg-indigo-100/50 text-indigo-600 border-indigo-200/50' :
                        task.status === 'approved' ? 'bg-green-100/50 text-green-600 border-green-200/50' :
                        'bg-coral-100/50 text-coral-600 border-coral-200/50'
                      }`}>
                        {task.status === 'pending' ? '进行中' :
                         task.status === 'completed' ? '待查看' :
                         task.status === 'approved' ? '已达成' : '需要改进'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 bg-stone-50/50 rounded-2xl border border-dashed border-stone-200">
                <p className="text-stone-400">没有进行中的约定</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
