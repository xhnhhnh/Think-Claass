import { useState } from 'react';
import { PlusCircle, Search, FileText, CheckCircle, Edit, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Assignment {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  classId: number;
  status: 'active' | 'closed';
}

interface Submission {
  id: number;
  studentName: string;
  assignmentId: number;
  content: string;
  status: 'submitted' | 'graded';
  grade?: number;
  feedback?: string;
}

export default function TeacherAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([
    { id: 1, title: '第一单元数学练习', description: '完成课本P12-P15的练习题', dueDate: '2026-04-10', classId: 1, status: 'active' },
    { id: 2, title: '语文作文', description: '写一篇关于春天的作文，不少于400字', dueDate: '2026-04-12', classId: 1, status: 'active' }
  ]);
  const [submissions, setSubmissions] = useState<Submission[]>([
    { id: 1, studentName: '张三', assignmentId: 1, content: '已完成所有练习题，拍照上传。', status: 'submitted' },
    { id: 2, studentName: '李四', assignmentId: 1, content: '最后一题不会做。', status: 'graded', grade: 85, feedback: '再接再厉' }
  ]);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newAssignment: Assignment = {
      id: Date.now(),
      title: newTitle,
      description: newDesc,
      dueDate: newDueDate,
      classId: 1,
      status: 'active'
    };
    setAssignments([...assignments, newAssignment]);
    setShowCreateModal(false);
    setNewTitle('');
    setNewDesc('');
    setNewDueDate('');
    toast.success('作业发布成功');
  };

  const handleGradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSubmission || !gradeInput) return;
    
    setSubmissions(submissions.map(s => 
      s.id === currentSubmission.id 
        ? { ...s, status: 'graded', grade: parseInt(gradeInput), feedback: feedbackInput }
        : s
    ));
    setShowGradeModal(false);
    toast.success('批改完成');
  };

  const deleteAssignment = (id: number) => {
    setAssignments(assignments.filter(a => a.id !== id));
    toast.success('作业已删除');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center space-x-2">
          <FileText className="h-6 w-6 text-blue-500" />
          <h2 className="text-lg font-bold text-slate-800">作业管理</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          发布作业
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assignments List */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-6">
          <h3 className="text-md font-bold text-slate-800 mb-4">已发布的作业</h3>
          <div className="space-y-4">
            {assignments.map(assignment => (
              <div key={assignment.id} className="p-4 border border-white/60 rounded-xl hover:shadow-md transition-shadow bg-slate-50/50/50">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-slate-800">{assignment.title}</h4>
                  <span className="px-2 py-1 bg-indigo-100/50 text-indigo-700 text-xs rounded-full font-medium">
                    {assignment.status === 'active' ? '进行中' : '已结束'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-3">{assignment.description}</p>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>截止日期: {assignment.dueDate || '无'}</span>
                  <button 
                    onClick={() => deleteAssignment(assignment.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {assignments.length === 0 && (
              <div className="text-center py-8 text-slate-500">暂无发布的作业</div>
            )}
          </div>
        </div>

        {/* Submissions List */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-6">
          <h3 className="text-md font-bold text-slate-800 mb-4">学生提交</h3>
          <div className="space-y-4">
            {submissions.map(sub => {
              const assignment = assignments.find(a => a.id === sub.assignmentId);
              return (
                <div key={sub.id} className="p-4 border border-white/60 rounded-xl hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-medium text-slate-800">
                      {sub.studentName} <span className="text-slate-500 text-sm">提交了</span> {assignment?.title}
                    </div>
                    {sub.status === 'graded' ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                        已批改: {sub.grade}分
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                        待批改
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 bg-slate-50/50 p-2 rounded mb-3">{sub.content}</p>
                  
                  {sub.status === 'submitted' && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setCurrentSubmission(sub);
                          setGradeInput('');
                          setFeedbackInput('');
                          setShowGradeModal(true);
                        }}
                        className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 text-sm font-medium"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        去批改
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create Assignment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">发布新作业</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAssignment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">作业标题</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="输入作业标题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">作业内容要求</label>
                <textarea
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="输入详细的作业要求..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
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
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-blue-500 hover:bg-blue-600"
                >
                  确认发布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grade Modal */}
      {showGradeModal && currentSubmission && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">批改作业 - {currentSubmission.studentName}</h3>
              <button onClick={() => setShowGradeModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleGradeSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50/50 p-3 rounded-2xl text-sm text-slate-700 mb-4">
                <strong>提交内容：</strong><br/>
                {currentSubmission.content}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">分数 (0-100)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="例如：95"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">评语反馈</label>
                <textarea
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  rows={2}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="写点评语鼓励一下学生吧..."
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGradeModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-blue-500 hover:bg-blue-600"
                >
                  提交批改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
