import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { CheckSquare, Plus, CheckCircle, XCircle, Clock, Trash2, AlertCircle, Heart, Star } from 'lucide-react';
import { toast } from 'sonner';

import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

interface FamilyTask {
  id: number;
  title: string;
  points: number;
  status: 'pending' | 'completed' | 'approved' | 'rejected';
  created_at: string;
}

export default function ParentTasks() {
  const user = useStore(state => state.user);
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPoints, setNewTaskPoints] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = async () => {
    if (!user?.studentId) return;
    try {
      setLoading(true);
      const data = await apiGet(`/api/family-tasks?studentId=${user.studentId}`);
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error) {
      toast.error('翻阅约定失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user?.studentId]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskPoints || !user?.studentId) return;

    const points = parseInt(newTaskPoints);
    if (isNaN(points) || points <= 0) {
      toast.error('请输入有效的小红花数量');
      return;
    }

    try {
      setSubmitting(true);

      const data = await apiPost('/api/family-tasks', {
        student_id: user.studentId,
        parent_id: user.id,
        title: newTaskTitle.trim(),
        points: points
      });

      if (data.success) {
        toast.success('新约定已记录');
        setShowAddModal(false);
        setNewTaskTitle('');
        setNewTaskPoints('');
        fetchTasks();
      } else {
        toast.error(data.message || '记录失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (task: FamilyTask, newStatus: 'approved' | 'rejected') => {
    try {
      const data = await apiPut(`/api/family-tasks/${task.id}`, { status: newStatus });

      if (data.success) {
        // If approved, give points to student
        if (newStatus === 'approved') {
          const pointsData = await apiPost(`/api/student/${user?.studentId}/points`, {
            amount: task.points,
            reason: `完成家庭约定: ${task.title}`
          });

          if (!pointsData.success) {
            toast.error('颁发小红花失败');
          } else {
            toast.success('约定已达成，小红花已颁发');
          }
        } else {
          toast.success('约定需要改进');
        }
        fetchTasks();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个约定吗？')) return;
    try {
      const data = await apiDelete(`/api/family-tasks/${id}`);
      if (data.success) {
        toast.success('约定已删除');
        fetchTasks();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };

  if (!user?.studentId) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 p-8 text-center max-w-5xl mx-auto">
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-3 py-1 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 border border-stone-200/50">进行中</span>;
      case 'completed':
        return <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-100 text-indigo-600 animate-pulse border border-indigo-200/50">待查看</span>;
      case 'approved':
        return <span className="px-3 py-1 rounded-xl text-xs font-bold bg-green-100 text-green-600 border border-green-200/50">已达成</span>;
      case 'rejected':
        return <span className="px-3 py-1 rounded-xl text-xs font-bold bg-coral-100 text-coral-600 border border-coral-200/50">需要改进</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-800 flex items-center">
            家庭时光
          </h1>
          <p className="text-stone-500 mt-2 tracking-wide">和宝贝定下温馨的小约定，见证成长</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center px-5 py-2.5 bg-coral-400 text-white rounded-2xl hover:bg-coral-500 transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-coral-500/30 hover:-translate-y-0.5 font-medium"
        >
          <Plus className="w-5 h-5 mr-2" />
          新约定
        </button>
      </div>

      <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 overflow-hidden">
        <div className="p-8 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] relative min-h-[400px]">
          <div className="absolute inset-0 bg-gradient-to-b from-[#fffdfa]/80 to-[#fffdfa]/40 pointer-events-none"></div>
          <div className="relative z-10">
            {loading ? (
              <div className="text-center py-16 text-stone-400 font-medium tracking-widest">翻阅记录中...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-16 text-stone-400">
                <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckSquare className="w-10 h-10 opacity-20" />
                </div>
                <p className="font-medium tracking-wide">还没有约定哦，和宝贝制定第一个小目标吧</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => (
                  <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-amber-50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                    <div className="mb-4 sm:mb-0">
                      <div className="flex items-center space-x-3 mb-2.5">
                        <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center shadow-inner">
                          <Star className="w-5 h-5" />
                        </div>
                        <h3 className="text-[17px] font-bold text-stone-800 tracking-wide">{task.title}</h3>
                        {getStatusBadge(task.status)}
                      </div>
                      <div className="flex items-center text-sm text-stone-500 space-x-4 pl-[3.25rem]">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1.5 opacity-70" />
                          {new Date(task.created_at).toLocaleDateString()}
                        </span>
                        <span className="font-bold text-amber-600 flex items-center bg-amber-50 px-2 py-0.5 rounded-lg">
                          <Heart className="w-3.5 h-3.5 mr-1 fill-current" />
                          {task.points} 朵小红花
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 sm:pl-4">
                      {task.status === 'completed' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(task, 'approved')}
                            className="flex items-center px-4 py-2 bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 rounded-xl transition-colors font-bold text-sm border border-green-200/50 shadow-sm"
                          >
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                            真棒
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(task, 'rejected')}
                            className="flex items-center px-4 py-2 bg-coral-50 text-coral-600 hover:bg-coral-100 hover:text-coral-700 rounded-xl transition-colors font-bold text-sm border border-coral-200/50 shadow-sm"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            再加油
                          </button>
                        </>
                      )}
                      {(task.status === 'pending' || task.status === 'rejected') && (
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="p-2.5 text-stone-400 hover:text-coral-500 hover:bg-coral-50 rounded-xl transition-colors"
                          title="删除约定"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#fffdfa] rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-amber-100/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-coral-100/50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-stone-800 tracking-wide flex items-center">
                  <div className="w-10 h-10 bg-coral-50 text-coral-400 rounded-xl flex items-center justify-center mr-3">
                    <Plus className="w-6 h-6" />
                  </div>
                  新的约定
                </h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleAddTask} className="space-y-6">
                <div>
                  <label className="block text-[15px] font-bold text-stone-700 mb-2">约定内容</label>
                  <input
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full px-5 py-3.5 bg-white rounded-2xl border border-amber-100 focus:ring-4 focus:ring-coral-100/50 focus:border-coral-300 outline-none transition-all shadow-sm text-stone-800 placeholder-stone-400"
                    placeholder="例如：自己整理书包、阅读半小时"
                  />
                </div>
                
                <div>
                  <label className="block text-[15px] font-bold text-stone-700 mb-2">奖励小红花</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      value={newTaskPoints}
                      onChange={(e) => setNewTaskPoints(e.target.value)}
                      className="w-full px-5 py-3.5 bg-white rounded-2xl border border-amber-100 focus:ring-4 focus:ring-coral-100/50 focus:border-coral-300 outline-none transition-all shadow-sm text-stone-800 placeholder-stone-400 pl-12"
                      placeholder="如：5"
                    />
                    <Heart className="w-5 h-5 text-coral-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="pt-4 flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-5 py-3.5 bg-stone-100 text-stone-600 rounded-2xl hover:bg-stone-200 transition-colors font-bold tracking-wide"
                  >
                    再想想
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-5 py-3.5 bg-coral-400 text-white rounded-2xl hover:bg-coral-500 disabled:opacity-50 transition-all duration-300 font-bold tracking-wide shadow-md hover:shadow-lg hover:shadow-coral-500/30 hover:-translate-y-0.5"
                  >
                    {submitting ? '记录中...' : '定下约定'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
