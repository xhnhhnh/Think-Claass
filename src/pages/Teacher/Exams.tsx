import { useState } from 'react';
import { PlusCircle, Search, Award, FileSpreadsheet, Edit, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Exam {
  id: number;
  title: string;
  subject: string;
  date: string;
  classId: number;
  status: 'upcoming' | 'completed';
}

interface ExamGrade {
  id: number;
  studentName: string;
  examId: number;
  score: number | null;
}

export default function TeacherExams() {
  const [exams, setExams] = useState<Exam[]>([
    { id: 1, title: '期中考试', subject: '数学', date: '2026-04-15', classId: 1, status: 'upcoming' },
    { id: 2, title: '第一单元测验', subject: '语文', date: '2026-03-20', classId: 1, status: 'completed' }
  ]);
  const [grades, setGrades] = useState<ExamGrade[]>([
    { id: 1, studentName: '张三', examId: 2, score: 95 },
    { id: 2, studentName: '李四', examId: 2, score: 88 },
    { id: 3, studentName: '王五', examId: 2, score: 76 }
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newDate, setNewDate] = useState('');

  const [showGradeModal, setShowGradeModal] = useState(false);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [editingGrades, setEditingGrades] = useState<Record<number, string>>({});

  const handleCreateExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSubject.trim()) return;
    const newExam: Exam = {
      id: Date.now(),
      title: newTitle,
      subject: newSubject,
      date: newDate,
      classId: 1,
      status: 'upcoming'
    };
    setExams([...exams, newExam]);
    setShowCreateModal(false);
    setNewTitle('');
    setNewSubject('');
    setNewDate('');
    toast.success('考试创建成功');
  };

  const deleteExam = (id: number) => {
    setExams(exams.filter(e => e.id !== id));
    toast.success('考试已删除');
  };

  const openGradeModal = (exam: Exam) => {
    setCurrentExam(exam);
    // Initialize editing state with current grades or empty
    const currentExamGrades = grades.filter(g => g.examId === exam.id);
    // If no grades exist, create empty ones for the mock students
    let initialGrades = currentExamGrades;
    if (initialGrades.length === 0) {
      initialGrades = [
        { id: Date.now() + 1, studentName: '张三', examId: exam.id, score: null },
        { id: Date.now() + 2, studentName: '李四', examId: exam.id, score: null },
        { id: Date.now() + 3, studentName: '王五', examId: exam.id, score: null },
      ];
      setGrades([...grades, ...initialGrades]);
    }

    const editingState: Record<number, string> = {};
    initialGrades.forEach(g => {
      editingState[g.id] = g.score !== null ? g.score.toString() : '';
    });
    setEditingGrades(editingState);
    setShowGradeModal(true);
  };

  const handleSaveGrades = () => {
    setGrades(grades.map(g => {
      if (editingGrades[g.id] !== undefined) {
        return { ...g, score: editingGrades[g.id] ? parseInt(editingGrades[g.id]) : null };
      }
      return g;
    }));
    
    if (currentExam) {
      setExams(exams.map(e => e.id === currentExam.id ? { ...e, status: 'completed' } : e));
    }
    
    setShowGradeModal(false);
    toast.success('成绩录入成功');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center space-x-2">
          <Award className="h-6 w-6 text-purple-500" />
          <h2 className="text-lg font-bold text-slate-800">考试与成绩</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)] font-medium"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          新建考试
        </button>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map(exam => (
            <div key={exam.id} className="p-5 border border-white/60 rounded-2xl hover:shadow-md transition-shadow relative bg-white/80 backdrop-blur-xl flex flex-col h-full">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-2xl">
                    {exam.subject}
                  </span>
                  <h3 className="font-bold text-slate-800 text-lg truncate" title={exam.title}>{exam.title}</h3>
                </div>
                <button 
                  onClick={() => deleteExam(exam.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              
              <div className="text-sm text-slate-500 mb-4 flex-grow">
                <p>考试日期: {exam.date || '未定'}</p>
                <p className="mt-1">
                  状态: 
                  <span className={`ml-2 font-medium ${exam.status === 'completed' ? 'text-indigo-600' : 'text-orange-500'}`}>
                    {exam.status === 'completed' ? '已完成' : '即将进行'}
                  </span>
                </p>
              </div>

              <button
                onClick={() => openGradeModal(exam)}
                className="w-full flex items-center justify-center px-4 py-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 font-medium transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {exam.status === 'completed' ? '查看/修改成绩' : '录入成绩'}
              </button>
            </div>
          ))}
          {exams.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500 border-2 border-dashed border-gray-200 rounded-2xl">
              还没有安排任何考试
            </div>
          )}
        </div>
      </div>

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">新建考试</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExam} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">考试名称</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                  placeholder="例如：期中考试"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">科目</label>
                <select
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                >
                  <option value="" disabled>请选择科目</option>
                  <option value="语文">语文</option>
                  <option value="数学">数学</option>
                  <option value="英语">英语</option>
                  <option value="科学">科学</option>
                  <option value="综合">综合</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">考试日期</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
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
                  className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-purple-500 hover:bg-purple-600"
                >
                  确认新建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Input Grades Modal */}
      {showGradeModal && currentExam && (
        <div className="fixed inset-0 bg-slate-50/500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-white/60 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">成绩录入</h3>
                <p className="text-sm text-slate-500">{currentExam.title} - {currentExam.subject}</p>
              </div>
              <button onClick={() => setShowGradeModal(false)} className="text-gray-400 hover:text-slate-500">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                <div className="flex justify-between px-4 py-2 bg-slate-100/50 rounded-2xl text-sm font-bold text-slate-700">
                  <span>学生姓名</span>
                  <span>分数</span>
                </div>
                {grades.filter(g => g.examId === currentExam.id).map(grade => (
                  <div key={grade.id} className="flex justify-between items-center px-4 py-2 border-b border-gray-50">
                    <span className="font-medium text-slate-800">{grade.studentName}</span>
                    <input
                      type="number"
                      min="0"
                      max="150"
                      value={editingGrades[grade.id] || ''}
                      onChange={(e) => setEditingGrades({...editingGrades, [grade.id]: e.target.value})}
                      className="w-24 text-center border-gray-300 rounded-2xl py-1 px-2 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                      placeholder="未录入"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-white/60 flex justify-end space-x-3 shrink-0 bg-slate-50/50">
              <button
                onClick={() => setShowGradeModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50"
              >
                取消
              </button>
              <button
                onClick={handleSaveGrades}
                className="px-4 py-2 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-purple-500 hover:bg-purple-600"
              >
                保存成绩
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
