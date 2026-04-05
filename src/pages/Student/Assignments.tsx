import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { BookOpen, CheckCircle, FileText, Award, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Assignment {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  status: 'pending' | 'submitted' | 'graded';
  score?: number;
}

interface Exam {
  id: number;
  title: string;
  date: string;
  score: number;
  totalScore: number;
}

export default function StudentAssignments() {
  const user = useStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'assignments' | 'exams'>('assignments');
  
  // Mock data for assignments
  const [assignments, setAssignments] = useState<Assignment[]>([
    { id: 1, title: '数学课后作业', description: '完成课本第32页练习题1-5', dueDate: '2023-11-15', status: 'pending' },
    { id: 2, title: '语文阅读理解', description: '阅读《背影》并写一篇不少于300字的读后感', dueDate: '2023-11-14', status: 'submitted' },
    { id: 3, title: '英语单词抄写', description: '抄写Unit 3单词各5遍', dueDate: '2023-11-10', status: 'graded', score: 95 },
  ]);

  // Mock data for exams
  const [exams, setExams] = useState<Exam[]>([
    { id: 1, title: '期中数学考试', date: '2023-11-01', score: 92, totalScore: 100 },
    { id: 2, title: '期中语文考试', date: '2023-11-02', score: 88, totalScore: 100 },
    { id: 3, title: '英语单元测试', date: '2023-10-20', score: 95, totalScore: 100 },
  ]);

  const handleSubmit = (id: number) => {
    setAssignments(assignments.map(a => 
      a.id === id ? { ...a, status: 'submitted' } : a
    ));
    toast.success('作业提交成功！');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl mx-auto space-y-8"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="bg-white rounded-[2rem] p-10 shadow-xl border-b-8 border-teal-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-cyan-400 opacity-10 pointer-events-none"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 mb-6 md:mb-0 text-center md:text-left">
          <h1 className="text-5xl font-black text-gray-900 mb-4 drop-shadow-sm flex items-center justify-center md:justify-start">
            <BookOpen className="h-12 w-12 mr-4 text-teal-500" />
            学业中心
          </h1>
          <p className="text-xl text-gray-600 font-bold">查看并管理你的作业与考试成绩</p>
        </div>
        
        <div className="relative z-10 hidden md:flex space-x-6">
          <motion.div 
            whileHover={{ scale: 1.05, y: -5 }}
            className="bg-blue-50 p-6 rounded-[2rem] text-center border-b-8 border-blue-200 shadow-md"
          >
            <p className="text-base text-blue-600 font-bold mb-2 uppercase tracking-wider">待办作业</p>
            <p className="text-5xl font-black text-blue-700 drop-shadow-sm">{assignments.filter(a => a.status === 'pending').length}</p>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.05, y: -5 }}
            className="bg-green-50 p-6 rounded-[2rem] text-center border-b-8 border-green-200 shadow-md"
          >
            <p className="text-base text-green-600 font-bold mb-2 uppercase tracking-wider">平均分</p>
            <p className="text-5xl font-black text-green-700 drop-shadow-sm">
              {Math.round(exams.reduce((acc, curr) => acc + curr.score, 0) / (exams.length || 1))}
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex justify-center space-x-6 mb-8">
        <motion.button
          whileHover={{ y: -4 }}
          whileTap={{ y: 0 }}
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center px-8 py-4 rounded-[2rem] font-black text-xl transition-all border-b-8 ${
            activeTab === 'assignments'
              ? 'bg-blue-500 text-white border-blue-700 shadow-xl'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-blue-600'
          }`}
        >
          <FileText className="mr-3 h-8 w-8" />
          我的作业
        </motion.button>
        <motion.button
          whileHover={{ y: -4 }}
          whileTap={{ y: 0 }}
          onClick={() => setActiveTab('exams')}
          className={`flex items-center px-8 py-4 rounded-[2rem] font-black text-xl transition-all border-b-8 ${
            activeTab === 'exams'
              ? 'bg-purple-500 text-white border-purple-700 shadow-xl'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600'
          }`}
        >
          <Award className="mr-3 h-8 w-8" />
          考试成绩
        </motion.button>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl border-8 border-gray-100"
        >
          {activeTab === 'assignments' ? (
            <div className="space-y-6">
              {assignments.length > 0 ? (
                assignments.map((assignment, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    key={assignment.id} 
                    className="flex flex-col md:flex-row md:items-center justify-between p-8 rounded-[2rem] border-4 border-gray-100 hover:border-blue-300 hover:shadow-xl transition-all bg-gray-50 relative overflow-hidden group"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-b from-blue-400 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex-1 mb-6 md:mb-0 pl-4">
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <h3 className="text-2xl font-black text-gray-900">{assignment.title}</h3>
                        {assignment.status === 'pending' && (
                          <span className="px-4 py-1.5 text-sm font-black bg-orange-100 text-orange-700 rounded-full border-2 border-orange-200 shadow-sm animate-pulse">待提交</span>
                        )}
                        {assignment.status === 'submitted' && (
                          <span className="px-4 py-1.5 text-sm font-black bg-blue-100 text-blue-700 rounded-full border-2 border-blue-200 shadow-sm">已提交</span>
                        )}
                        {assignment.status === 'graded' && (
                          <span className="px-4 py-1.5 text-sm font-black bg-green-100 text-green-700 rounded-full border-2 border-green-200 shadow-sm">已批改</span>
                        )}
                      </div>
                      <p className="text-gray-600 text-lg font-medium mb-4">{assignment.description}</p>
                      <div className="flex items-center text-sm font-bold text-gray-500 bg-white inline-flex px-4 py-2 rounded-xl border-2 border-gray-200 shadow-sm">
                        <AlertCircle className="w-5 h-5 mr-2 text-orange-500" />
                        截止日期: {assignment.dueDate}
                      </div>
                    </div>
                    <div className="flex items-center md:ml-8 space-x-6 pl-4 md:pl-0">
                      {assignment.status === 'graded' && (
                        <div className="text-center bg-white p-4 rounded-2xl border-4 border-green-100 shadow-sm">
                          <span className="block text-sm font-bold text-gray-500 mb-1">得分</span>
                          <span className="text-4xl font-black text-green-600 drop-shadow-sm">{assignment.score}</span>
                        </div>
                      )}
                      {assignment.status === 'pending' && (
                        <motion.button 
                          whileHover={{ scale: 1.05, y: -4 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSubmit(assignment.id)}
                          className="px-8 py-4 bg-blue-500 text-white rounded-[1.5rem] font-black text-xl border-b-8 border-blue-700 hover:bg-blue-400 shadow-lg flex items-center"
                        >
                          <CheckCircle className="w-6 h-6 mr-3" />
                          提交作业
                        </motion.button>
                      )}
                      {assignment.status === 'submitted' && (
                        <button disabled className="px-8 py-4 bg-gray-200 text-gray-500 rounded-[1.5rem] font-black text-xl border-b-8 border-gray-300 cursor-not-allowed flex items-center shadow-sm">
                          <CheckCircle className="w-6 h-6 mr-3" />
                          等待批改
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-20 text-gray-400">
                  <FileText className="mx-auto h-24 w-24 mb-6 opacity-30" />
                  <p className="text-2xl font-black">暂无作业数据</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {exams.length > 0 ? (
                exams.map((exam, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.05, y: -10 }}
                    key={exam.id} 
                    className="p-8 rounded-[2.5rem] border-8 border-purple-100 bg-white hover:border-purple-300 hover:shadow-2xl transition-all relative overflow-hidden group"
                  >
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-100 rounded-full mix-blend-multiply opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <div className="p-4 bg-purple-100 rounded-[1.5rem] text-purple-600 shadow-inner border-b-4 border-purple-200">
                        <Award className="w-10 h-10" />
                      </div>
                      <span className="text-sm font-black text-gray-500 bg-gray-100 px-4 py-2 rounded-full border-2 border-gray-200 shadow-sm">
                        {exam.date}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 mb-8 relative z-10">{exam.title}</h3>
                    <div className="flex items-end justify-between relative z-10">
                      <div>
                        <span className="text-base font-bold text-gray-500 block mb-2 uppercase tracking-widest">最终得分</span>
                        <div className="flex items-baseline">
                          <span className="text-6xl font-black text-purple-600 drop-shadow-md">{exam.score}</span>
                          <span className="text-xl font-bold text-gray-400 ml-2">/ {exam.totalScore}</span>
                        </div>
                      </div>
                      {exam.score >= 90 && (
                        <span className="px-4 py-2 bg-yellow-100 text-yellow-700 text-sm font-black rounded-full border-2 border-yellow-300 shadow-sm rotate-[-10deg] animate-bounce">
                          👑 优秀
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="col-span-full text-center py-20 text-gray-400">
                  <Award className="mx-auto h-24 w-24 mb-6 opacity-30" />
                  <p className="text-2xl font-black">暂无考试成绩</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
