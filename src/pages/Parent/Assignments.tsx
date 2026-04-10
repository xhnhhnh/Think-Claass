import { useState } from 'react';
import { BookOpen, CheckCircle, FileText, Award, AlertCircle, BarChart3, Clock, TrendingUp, Star, Heart } from 'lucide-react';

interface Assignment {
  id: number;
  title: string;
  subject: string;
  dueDate: string;
  status: 'pending' | 'submitted' | 'graded';
  score?: number;
}

interface Exam {
  id: number;
  title: string;
  subject: string;
  date: string;
  score: number;
  totalScore: number;
  classAverage: number;
}

export default function ParentAssignments() {
  const [activeTab, setActiveTab] = useState<'assignments' | 'exams'>('assignments');
  
  const assignments: Assignment[] = [
    { id: 1, title: '数学课后练习', subject: '数学', dueDate: '2023-11-15', status: 'pending' },
    { id: 2, title: '语文阅读分享', subject: '语文', dueDate: '2023-11-14', status: 'submitted' },
    { id: 3, title: '英语单词记忆', subject: '英语', dueDate: '2023-11-10', status: 'graded', score: 95 },
    { id: 4, title: '科学小实验', subject: '科学', dueDate: '2023-11-08', status: 'graded', score: 88 },
  ];

  const exams: Exam[] = [
    { id: 1, title: '期中数学检测', subject: '数学', date: '2023-11-01', score: 92, totalScore: 100, classAverage: 85 },
    { id: 2, title: '期中语文检测', subject: '语文', date: '2023-11-02', score: 88, totalScore: 100, classAverage: 82 },
    { id: 3, title: '英语单元小测', subject: '英语', date: '2023-10-20', score: 95, totalScore: 100, classAverage: 90 },
  ];

  const getSubjectColor = (subject: string) => {
    switch(subject) {
      case '数学': return 'bg-indigo-50 text-indigo-500 border-indigo-100/50';
      case '语文': return 'bg-coral-50 text-coral-500 border-coral-100/50';
      case '英语': return 'bg-amber-50 text-amber-500 border-amber-100/50';
      default: return 'bg-green-50 text-green-500 border-green-100/50';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-coral-400 to-amber-300 rounded-[2rem] p-7 text-white shadow-lg shadow-coral-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
            <Star className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tracking-wide">待完成学习</h2>
              <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner border border-white/20">
                <Clock className="w-6 h-6" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-5xl font-black tracking-tight">
                {assignments.filter(a => a.status === 'pending').length}
              </span>
              <span className="text-amber-50 font-medium">项</span>
            </div>
            <p className="text-sm text-amber-50 mt-3 font-medium tracking-wide">陪伴宝贝一起完成吧</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-400 to-emerald-300 rounded-[2rem] p-7 text-white shadow-lg shadow-green-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
            <BarChart3 className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tracking-wide">平均成绩</h2>
              <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner border border-white/20">
                <Heart className="w-6 h-6" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-5xl font-black tracking-tight">
                {Math.round(exams.reduce((acc, curr) => acc + curr.score, 0) / (exams.length || 1))}
              </span>
              <span className="text-green-50 font-medium">分</span>
            </div>
            <p className="text-sm text-green-50 mt-3 flex items-center font-medium tracking-wide">
              <TrendingUp className="w-4 h-4 mr-1.5" />
              表现很棒哦
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-400 to-purple-300 rounded-[2rem] p-7 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
            <CheckCircle className="w-48 h-48" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold tracking-wide">学习完成率</h2>
              <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner border border-white/20">
                <CheckCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-5xl font-black tracking-tight">
                {Math.round((assignments.filter(a => a.status !== 'pending').length / assignments.length) * 100)}
              </span>
              <span className="text-indigo-50 font-medium">%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 mt-4 shadow-inner overflow-hidden">
              <div className="bg-white h-full rounded-full transition-all duration-1000 ease-out" style={{ width: '75%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-amber-50 bg-white/50 backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`flex-1 flex items-center justify-center py-5 text-[15px] font-bold transition-all duration-300 ${
              activeTab === 'assignments'
                ? 'text-coral-500 border-b-2 border-coral-400 bg-coral-50/30'
                : 'text-stone-400 hover:text-coral-400 hover:bg-coral-50/10'
            }`}
          >
            <BookOpen className="w-5 h-5 mr-2.5" />
            学习记录
          </button>
          <button
            onClick={() => setActiveTab('exams')}
            className={`flex-1 flex items-center justify-center py-5 text-[15px] font-bold transition-all duration-300 ${
              activeTab === 'exams'
                ? 'text-coral-500 border-b-2 border-coral-400 bg-coral-50/30'
                : 'text-stone-400 hover:text-coral-400 hover:bg-coral-50/10'
            }`}
          >
            <Award className="w-5 h-5 mr-2.5" />
            闪光成绩
          </button>
        </div>

        <div className="p-8 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] relative min-h-[400px]">
          <div className="absolute inset-0 bg-gradient-to-b from-[#fffdfa]/80 to-[#fffdfa]/40 pointer-events-none"></div>
          
          <div className="relative z-10">
            {activeTab === 'assignments' ? (
              <div className="space-y-4">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl border border-amber-50 hover:border-coral-100/50 hover:shadow-md transition-all duration-300 bg-white/80 backdrop-blur-sm hover:-translate-y-0.5 group">
                    <div className="flex items-start space-x-5">
                      <div className={`px-4 py-2 rounded-xl text-sm font-bold border shadow-sm ${getSubjectColor(assignment.subject)}`}>
                        {assignment.subject}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-stone-800 mb-1.5 group-hover:text-coral-500 transition-colors tracking-wide">
                          {assignment.title}
                        </h3>
                        <div className="flex items-center text-sm text-stone-400 font-medium tracking-wider">
                          <Clock className="w-4 h-4 mr-1.5 opacity-70" />
                          截止: {assignment.dueDate}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-5 md:mt-0 flex items-center justify-between md:justify-end md:w-48">
                      {assignment.status === 'pending' && (
                        <span className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-sm font-bold bg-amber-50 text-amber-600 border border-amber-100/50 shadow-sm">
                          <AlertCircle className="w-4 h-4 mr-1.5" />待完成
                        </span>
                      )}
                      {assignment.status === 'submitted' && (
                        <span className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-sm font-bold bg-indigo-50 text-indigo-500 border border-indigo-100/50 shadow-sm">
                          <FileText className="w-4 h-4 mr-1.5" />老师查看中
                        </span>
                      )}
                      {assignment.status === 'graded' && (
                        <div className="text-right">
                          <span className="block text-xs text-stone-400 mb-0.5 font-bold tracking-widest uppercase">得分</span>
                          <span className="text-3xl font-black text-green-500 tracking-tight">{assignment.score}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {exams.map((exam) => (
                  <div key={exam.id} className="p-7 rounded-2xl border border-amber-50 bg-white/60 backdrop-blur-sm hover:bg-white hover:shadow-lg hover:border-coral-100/50 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <div className="flex items-center space-x-4">
                        <div className={`px-4 py-2 rounded-xl text-sm font-bold border shadow-sm ${getSubjectColor(exam.subject)}`}>
                          {exam.subject}
                        </div>
                        <span className="text-sm text-stone-400 font-medium tracking-wider">
                          {exam.date}
                        </span>
                      </div>
                      {exam.score >= 90 && (
                        <span className="px-3.5 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl flex items-center border border-amber-100/50 shadow-sm">
                          <Star className="w-3.5 h-3.5 mr-1.5 fill-current" />
                          太棒啦
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-bold text-stone-800 mb-8 group-hover:text-coral-500 transition-colors tracking-wide relative z-10">
                      {exam.title}
                    </h3>
                    
                    <div className="flex items-end justify-between bg-stone-50/50 p-5 rounded-2xl border border-stone-100/50 relative z-10">
                      <div>
                        <span className="text-xs text-stone-400 block mb-1 font-bold tracking-widest uppercase">班级平均分</span>
                        <span className="text-xl font-bold text-stone-500">{exam.classAverage}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-stone-400 block mb-1 font-bold tracking-widest uppercase">宝贝得分</span>
                        <div className="flex items-baseline justify-end">
                          <span className={`text-4xl font-black tracking-tight ${exam.score >= exam.classAverage ? 'text-green-500' : 'text-coral-500'}`}>
                            {exam.score}
                          </span>
                          <span className="text-sm text-stone-400 ml-1.5 font-medium">/ {exam.totalScore}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
