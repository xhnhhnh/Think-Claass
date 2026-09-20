import { useStore } from '@/store/useStore';
import { CheckCircle, Clock, Star, TrendingUp, AlertCircle, ChevronRight, Heart, Sparkles, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { useParentBuffMutation, useParentDashboard } from '@/hooks/queries/useParentDashboard';
import { launchConfetti } from '@/lib/confetti';
import { CELEBRATION } from '@/lib/celebrationPalette';
import { defaultClassFeatures } from '@/lib/classFeatures';
import { getRankTier } from '@/lib/rankTier';
import { Button } from '@/components/ui/button';

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

export default function ParentDashboard() {
  const user = useStore(state => state.user);
  const navigate = useNavigate();
  const studentId = user?.studentId ?? null;
  const classFeatures = user?.classFeatures ?? defaultClassFeatures;
  const familyTasksEnabled = classFeatures.enable_family_tasks;
  const parentBuffEnabled = classFeatures.enable_parent_buff;
  const { data, isLoading: loading } = useParentDashboard(studentId);
  const castBuffMutation = useParentBuffMutation(studentId);
  const student = (data?.student ?? null) as StudentInfo | null;
  const records = ((data?.records ?? []) as Record[]).slice(0, 5);
  const tasks = ((data?.tasks ?? []) as FamilyTask[]).slice(0, 5);
  const buffActive = !!data?.pet?.has_parent_buff;
  const buffLoading = castBuffMutation.isPending;

  const castParentBuff = async () => {
    if (!parentBuffEnabled) {
      toast.info('老师开启家长祝福后，就可以给孩子送上今日鼓励啦');
      return;
    }

    if (buffActive) {
      toast.info('今日已经施放过祝福啦！');
      return;
    }
    try {
      await castBuffMutation.mutateAsync();
      toast.success('✨ 母爱的祝福已施放！');
      void launchConfetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: [...CELEBRATION.brand],
      });
    } catch (error) {
      toast.error('网络错误');
    }
  };

  if (!user?.studentId) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-paper rounded-panel shadow-raised border border-warning/20 p-8 text-center">
        <div className="w-20 h-20 bg-warning/10 rounded-full flex items-center justify-center mb-6">
          <Heart className="w-10 h-10 text-primary/80" />
        </div>
        <h2 className="text-2xl font-bold text-ink-1 mb-3">等待宝贝加入</h2>
        <p className="text-ink-3 max-w-md">
          您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center items-center h-64 text-ink-3 font-medium">翻阅日记中...</div>;
  }

  const pendingTasksCount = tasks.filter(t => t.status === 'pending' || t.status === 'completed').length;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-ink-1">温馨家园</h1>
        <p className="text-ink-3">记录宝贝的每一天</p>
      </div>

      {student && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-primary via-primary/85 to-warning rounded-panel p-8 text-white shadow-raised shadow-orange-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
              <Star className="w-64 h-64" />
            </div>
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <h2 className="text-4xl font-bold mb-3">{student.name}</h2>
                <div className="flex items-center space-x-4 mt-5">
                  <div className="bg-paper/20 px-5 py-2.5 rounded-card backdrop-blur-md border border-white/20">
                    <p className="text-amber-50 text-sm font-medium">成长足迹</p>
                    <p className="font-bold text-xl">{getRankTier(student.total_points)}</p>
                  </div>
                  <div className="bg-paper/20 px-5 py-2.5 rounded-card backdrop-blur-md border border-white/20">
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

          <div className="bg-paper rounded-panel p-7 shadow-raised border border-warning/10 flex flex-col justify-between hover:shadow-raised transition-all duration-300">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold text-ink-1 flex items-center">
                  <div className="w-10 h-10 bg-green-50 rounded-card flex items-center justify-center mr-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  家庭时光
                </h3>
              </div>
              <p className="text-ink-3 text-sm mb-5 leading-relaxed">
                陪伴是最长情的告白，和宝贝一起完成有趣的家庭小任务吧。
              </p>
              <div className="bg-warning rounded-card p-4 flex items-center justify-between border border-warning/20">
                <span className="text-amber-800 font-medium">等待您查收</span>
                <span className="bg-primary text-primary-foreground px-3 py-1 rounded-xl text-sm font-bold shadow-sm">
                  {pendingTasksCount}
                </span>
              </div>
            </div>
            
            <div className="mt-6 space-y-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={castParentBuff}
                disabled={!parentBuffEnabled || buffActive || buffLoading}
                className={`w-full flex items-center justify-center space-x-2 py-3.5 rounded-card font-bold transition-all shadow-md ${
                  !parentBuffEnabled || buffActive 
                    ? 'bg-amber-100 text-amber-500 cursor-not-allowed border border-amber-200' 
                    : 'bg-gradient-to-r from-amber-400 to-orange-400 text-white hover:shadow-raised hover:shadow-orange-400/30'
                }`}
              >
                <Wand2 className="w-5 h-5" />
                <span>
                  {!parentBuffEnabled
                    ? '老师开启后可送祝福'
                    : buffActive
                      ? '今日祝福已送达'
                      : '施放母爱的祝福 (+20%积分)'}
                </span>
              </motion.button>
              
              {familyTasksEnabled ? (
                <Button
                onClick={() => navigate('/parent/tasks')}
                className="w-full flex items-center justify-center space-x-2 bg-muted/50 hover:bg-muted text-ink-2 py-3.5 rounded-card font-medium transition-colors"
              >
                <span>查看家庭任务</span>
                <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <div className="rounded-card border border-warning/20 bg-warning px-4 py-3 text-center text-sm font-medium text-amber-700">
                  老师开启家庭任务后，这里会出现亲子约定
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {/* 近期记录 */}
        <div className="bg-paper rounded-panel shadow-raised border border-warning/10 p-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-ink-1 flex items-center">
              <div className="w-10 h-10 bg-primary/5 rounded-card flex items-center justify-center mr-3">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              闪光时刻
            </h3>
            <Button 
              onClick={() => navigate('/parent/report')}
              className="text-sm text-primary hover:text-primary font-medium px-3 py-1.5 bg-primary rounded-xl transition-colors"
            >
              完整足迹
            </Button>
          </div>
          <div className="space-y-4">
            {records.length > 0 ? (
              records.map(record => (
                <div key={record.id} className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted/50 rounded-card transition-colors border border-transparent hover:border-border">
                  <div className="flex items-center">
                    <div className={`p-2.5 rounded-xl mr-4 ${record.amount > 0 ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'}`}>
                      {record.amount > 0 ? <Star className="w-5 h-5" /> : <TrendingUp className="w-5 h-5 transform rotate-180" />}
                    </div>
                    <div>
                      <p className="font-medium text-ink-1">{record.description}</p>
                      <p className="text-xs text-ink-3 mt-1.5">
                        {new Date(record.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={`font-bold text-lg ${record.amount > 0 ? 'text-green-500' : 'text-primary'}`}>
                    {record.amount > 0 ? '+' : ''}{record.amount}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 bg-muted/50 rounded-card border border-dashed border-border">
                <p className="text-ink-3">还没有新的记录哦</p>
              </div>
            )}
          </div>
        </div>

        {/* 近期任务 */}
        <div className="bg-paper rounded-panel shadow-raised border border-warning/10 p-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-ink-1 flex items-center">
              <div className="w-10 h-10 bg-warning/10 rounded-card flex items-center justify-center mr-3">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              最近的约定
            </h3>
            {familyTasksEnabled ? (
              <Button 
                onClick={() => navigate('/parent/tasks')}
                className="text-sm text-warning hover:text-warning font-medium px-3 py-1.5 bg-warning rounded-xl transition-colors"
              >
                所有约定
              </Button>
            ) : null}
          </div>
          <div className="space-y-4">
            {tasks.length > 0 ? (
              tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted/50 rounded-card transition-colors border border-transparent hover:border-border">
                  <div>
                    <h4 className="font-medium text-ink-1">{task.title}</h4>
                    <div className="flex items-center mt-2.5 space-x-2">
                      <span className="text-xs font-medium px-2.5 py-1 bg-amber-100/50 text-amber-700 rounded-lg border border-amber-200/50">
                        {task.points} 朵小红花
                      </span>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${
                        task.status === 'pending' ? 'bg-muted/50 text-ink-2 border-border' :
                        task.status === 'completed' ? 'bg-info text-primary border-primary/20' :
                        task.status === 'approved' ? 'bg-green-100/50 text-green-600 border-green-200/50' :
                        'bg-primary/10 text-primary border-primary/20'
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
              <div className="text-center py-10 bg-muted/50 rounded-card border border-dashed border-border">
                <p className="text-ink-3">
                  {familyTasksEnabled ? '没有进行中的约定' : '家庭任务开启后，这里会同步亲子约定'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
