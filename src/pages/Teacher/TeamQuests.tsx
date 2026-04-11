import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle, LoaderCircle, PlusCircle, Target, Trash2, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { teamQuestsApi, type TeamQuest } from '@/api/teamQuests';
import { useTeamQuestGroupProgress, useTeamQuests } from '@/hooks/queries/useTeamQuests';
import { useStore } from '@/store/useStore';

export default function TeacherTeamQuests() {
  const queryClient = useQueryClient();
  const user = useStore((state) => state.user);
  const classId = user?.class_id ?? 1;
  const teacherId = user?.id ?? 1;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [currentQuest, setCurrentQuest] = useState<TeamQuest | null>(null);

  const { data: quests = [], isLoading, error } = useTeamQuests(classId);
  const {
    data: progressData = [],
    isLoading: isProgressLoading,
  } = useTeamQuestGroupProgress(currentQuest?.id ?? null, classId, showProgressModal);

  const createMutation = useMutation({
    mutationFn: teamQuestsApi.createTeamQuest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team-quests', classId] });
      toast.success('团队任务发布成功');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPoints('');
      setNewTarget('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: teamQuestsApi.deleteTeamQuest,
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['team-quests', classId] });
      if (currentQuest?.id === deletedId) {
        setCurrentQuest(null);
        setShowProgressModal(false);
      }
      toast.success('团队任务已删除');
    },
  });

  const currentQuestOverallPercent = useMemo(() => {
    if (!currentQuest || progressData.length === 0) return 0;
    const totalProgress = progressData.reduce((sum, item) => sum + item.contribution_score, 0);
    const totalTarget = currentQuest.target_score * progressData.length;
    if (totalTarget <= 0) return 0;
    return Math.min(100, Math.round((totalProgress / totalTarget) * 100));
  }, [currentQuest, progressData]);

  const handleCreateQuest = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPoints || !newTarget) return;

    await createMutation.mutateAsync({
      class_id: classId,
      teacher_id: teacherId,
      title: newTitle.trim(),
      description: newDesc.trim(),
      target_score: parseInt(newTarget, 10),
      reward_points: parseInt(newPoints, 10),
    });
  };

  const handleDeleteQuest = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const openProgressModal = (quest: TeamQuest) => {
    setCurrentQuest(quest);
    setShowProgressModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center space-x-2">
          <Target className="h-6 w-6 text-red-500" />
          <h2 className="text-lg font-bold text-slate-800">团队任务</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          发布团队任务
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-2xl border border-white/60 bg-white/80 py-16 text-slate-500">
          <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
          正在加载团队任务...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center text-red-600">
          团队任务加载失败，请稍后重试
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quests.map((quest) => (
            <div
              key={quest.id}
              className="p-6 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl hover:shadow-md transition-shadow relative flex flex-col h-full"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{quest.title}</h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        quest.status === 'active' ? 'bg-indigo-100/50 text-indigo-700' : 'bg-slate-100/50 text-slate-700'
                      }`}
                    >
                      {quest.status === 'active' ? '进行中' : '已结束'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteQuest(quest.id)}
                  disabled={deleteMutation.isPending}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              <div className="text-sm text-slate-600 mb-6 flex-grow">
                <p className="mb-2">{quest.description || '暂无任务描述'}</p>
                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="bg-orange-50 px-3 py-1.5 rounded-2xl border border-orange-100">
                    <span className="text-xs text-orange-600 block">奖励积分</span>
                    <span className="font-bold text-orange-700">{quest.reward_points} 币/组</span>
                  </div>
                  <div className="bg-blue-50 px-3 py-1.5 rounded-2xl border border-blue-100">
                    <span className="text-xs text-blue-600 block">目标进度</span>
                    <span className="font-bold text-blue-700">{quest.target_score} 次/组</span>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-500 space-y-1">
                  <p>开始时间：{quest.start_date || '未设置'}</p>
                  <p>截止时间：{quest.end_date || '未设置'}</p>
                </div>
              </div>

              <button
                onClick={() => openProgressModal(quest)}
                className="w-full flex items-center justify-center px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium transition-colors border border-red-100"
              >
                <Users className="h-4 w-4 mr-2" />
                查看各组进度
              </button>
            </div>
          ))}
          {quests.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500 border-2 border-dashed border-gray-200 rounded-2xl bg-white/80 backdrop-blur-xl">
              暂无发布的团队任务
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">发布团队任务</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateQuest} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">任务名称</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-red-500 focus:border-red-500 sm:text-sm"
                  placeholder="例如：书香班级挑战"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">任务描述</label>
                <textarea
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-red-500 focus:border-red-500 sm:text-sm"
                  placeholder="说明任务内容..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">每组目标数量</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-red-500 focus:border-red-500 sm:text-sm"
                    placeholder="例如: 10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">达成奖励(积分)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newPoints}
                    onChange={(e) => setNewPoints(e.target.value)}
                    className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-red-500 focus:border-red-500 sm:text-sm"
                    placeholder="例如: 50"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                >
                  {createMutation.isPending ? '发布中...' : '确认发布'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProgressModal && currentQuest && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">各组进度</h3>
                <p className="text-sm text-slate-500">
                  {currentQuest.title}（目标：{currentQuest.target_score}）
                </p>
                <p className="text-xs text-slate-400 mt-1">总体进度：{currentQuestOverallPercent}%</p>
              </div>
              <button onClick={() => setShowProgressModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {isProgressLoading && (
                <div className="flex items-center justify-center py-10 text-slate-500">
                  <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
                  正在加载进度...
                </div>
              )}

              {!isProgressLoading && progressData.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-slate-500">
                  暂无可展示的分组进度
                </div>
              )}

              {!isProgressLoading &&
                progressData.map((progress) => {
                  const percent = currentQuest.target_score > 0
                    ? Math.min(100, Math.round((progress.contribution_score / currentQuest.target_score) * 100))
                    : 0;
                  const isCompleted = progress.contribution_score >= currentQuest.target_score;

                  return (
                    <div key={`${progress.group_id ?? 'ungrouped'}-${progress.group_name}`} className="p-4 border border-white/60 rounded-xl bg-slate-50/50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-slate-800 text-lg flex items-center">
                          {progress.group_name}
                          {isCompleted && <CheckCircle className="w-5 h-5 text-indigo-500 ml-2" />}
                        </span>
                        <span className={`font-bold ${isCompleted ? 'text-indigo-600' : 'text-slate-600'}`}>
                          {progress.contribution_score} / {currentQuest.target_score}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ${isCompleted ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-blue-500'}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="px-6 py-4 border-t border-white/60 flex justify-end shrink-0 bg-white/80 backdrop-blur-xl">
              <button
                onClick={() => setShowProgressModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
