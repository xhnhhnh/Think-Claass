import { useState } from 'react';
import { PlusCircle, Search, Target, Users, CheckCircle, Trash2, XCircle, Award } from 'lucide-react';
import { toast } from 'sonner';

interface TeamQuest {
  id: number;
  title: string;
  description: string;
  points: number;
  targetProgress: number;
  classId: number;
  status: 'active' | 'completed';
}

interface TeamProgress {
  id: number;
  teamName: string;
  questId: number;
  currentProgress: number;
}

export default function TeacherTeamQuests() {
  const [quests, setQuests] = useState<TeamQuest[]>([
    { id: 1, title: '课后阅读挑战', description: '全组共同阅读10本课外书', points: 50, targetProgress: 10, classId: 1, status: 'active' },
    { id: 2, title: '数学练习周', description: '全组完成50道附加题', points: 100, targetProgress: 50, classId: 1, status: 'completed' }
  ]);
  const [progressData, setProgressData] = useState<TeamProgress[]>([
    { id: 1, teamName: '第一组', questId: 1, currentProgress: 4 },
    { id: 2, teamName: '第二组', questId: 1, currentProgress: 8 },
    { id: 3, teamName: '第三组', questId: 1, currentProgress: 10 },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const [showProgressModal, setShowProgressModal] = useState(false);
  const [currentQuest, setCurrentQuest] = useState<TeamQuest | null>(null);

  const handleCreateQuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPoints || !newTarget) return;
    
    const newQuest: TeamQuest = {
      id: Date.now(),
      title: newTitle,
      description: newDesc,
      points: parseInt(newPoints),
      targetProgress: parseInt(newTarget),
      classId: 1,
      status: 'active'
    };
    
    setQuests([...quests, newQuest]);
    
    // Initialize empty progress for some mock teams
    const newProgress = [
      { id: Date.now() + 1, teamName: '第一组', questId: newQuest.id, currentProgress: 0 },
      { id: Date.now() + 2, teamName: '第二组', questId: newQuest.id, currentProgress: 0 },
      { id: Date.now() + 3, teamName: '第三组', questId: newQuest.id, currentProgress: 0 },
    ];
    setProgressData([...progressData, ...newProgress]);
    
    setShowCreateModal(false);
    setNewTitle('');
    setNewDesc('');
    setNewPoints('');
    setNewTarget('');
    toast.success('团队任务发布成功');
  };

  const deleteQuest = (id: number) => {
    setQuests(quests.filter(q => q.id !== id));
    toast.success('团队任务已删除');
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {quests.map(quest => {
          const questProgress = progressData.filter(p => p.questId === quest.id);
          const totalProgress = questProgress.reduce((sum, p) => sum + p.currentProgress, 0);
          const totalTarget = quest.targetProgress * questProgress.length;
          const overallPercent = totalTarget > 0 ? Math.min(100, Math.round((totalProgress / totalTarget) * 100)) : 0;

          return (
            <div key={quest.id} className="p-6 bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl hover:shadow-md transition-shadow relative flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{quest.title}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      quest.status === 'active' ? 'bg-indigo-100/50 text-indigo-700' : 'bg-slate-100/50 text-slate-700'
                    }`}>
                      {quest.status === 'active' ? '进行中' : '已结束'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => deleteQuest(quest.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
              
              <div className="text-sm text-slate-600 mb-6 flex-grow">
                <p className="mb-2">{quest.description}</p>
                <div className="flex space-x-4 mt-4">
                  <div className="bg-orange-50 px-3 py-1.5 rounded-2xl border border-orange-100">
                    <span className="text-xs text-orange-600 block">奖励积分</span>
                    <span className="font-bold text-orange-700">{quest.points} 币/组</span>
                  </div>
                  <div className="bg-blue-50 px-3 py-1.5 rounded-2xl border border-blue-100">
                    <span className="text-xs text-blue-600 block">目标进度</span>
                    <span className="font-bold text-blue-700">{quest.targetProgress} 次/组</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex justify-between text-sm mb-1 text-slate-500">
                  <span>总体进度</span>
                  <span className="font-bold text-slate-700">{overallPercent}%</span>
                </div>
                <div className="w-full bg-slate-100/50 rounded-full h-2.5">
                  <div 
                    className="bg-red-500 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${overallPercent}%` }}
                  ></div>
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
          );
        })}
        {quests.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500 border-2 border-dashed border-gray-200 rounded-2xl bg-white/80 backdrop-blur-xl">
            暂无发布的团队任务
          </div>
        )}
      </div>

      {/* Create Quest Modal */}
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
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-red-500 hover:bg-red-600"
                >
                  确认发布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      {showProgressModal && currentQuest && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">各组进度</h3>
                <p className="text-sm text-slate-500">{currentQuest.title} (目标: {currentQuest.targetProgress})</p>
              </div>
              <button onClick={() => setShowProgressModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {progressData.filter(p => p.questId === currentQuest.id).map(progress => {
                const percent = Math.min(100, Math.round((progress.currentProgress / currentQuest.targetProgress) * 100));
                const isCompleted = progress.currentProgress >= currentQuest.targetProgress;
                
                return (
                  <div key={progress.id} className="p-4 border border-white/60 rounded-xl bg-slate-50/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-slate-800 text-lg flex items-center">
                        {progress.teamName}
                        {isCompleted && <CheckCircle className="w-5 h-5 text-indigo-500 ml-2" />}
                      </span>
                      <span className={`font-bold ${isCompleted ? 'text-indigo-600' : 'text-slate-600'}`}>
                        {progress.currentProgress} / {currentQuest.targetProgress}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${isCompleted ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-blue-500'}`} 
                        style={{ width: `${percent}%` }}
                      ></div>
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
