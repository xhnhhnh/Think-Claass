import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Swords, Shield, Trophy, Flame, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Question {
  id: number;
  title: string;
  type: 'SINGLE' | 'MULTIPLE' | 'JUDGE';
  options: string[] | string;
}

interface Boss {
  id: number;
  name: string;
  description: string;
  hp: number;
  max_hp: number;
  level: number;
  status: string;
}

export default function StudentChallenge() {
  const user = useStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'questions' | 'boss'>('questions');
  
  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Boss State
  const [boss, setBoss] = useState<Boss | null>(null);
  const [isAttacking, setIsAttacking] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);

  useEffect(() => {
    if (activeTab === 'questions' && questions.length === 0 && !result) {
      fetchQuestions();
    } else if (activeTab === 'boss' && !boss) {
      fetchBoss();
    }
  }, [activeTab]);

  useEffect(() => {
    // Get student's classId
    if (user?.studentId) {
      fetch(`/api/students`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const student = data.students.find((s: any) => s.id === user.studentId);
            if (student) setClassId(student.class_id);
          }
        });
    }
  }, [user]);

  useEffect(() => {
    if (classId && activeTab === 'boss') {
      fetchBoss();
    }
  }, [classId]);

  const fetchQuestions = async () => {
    try {
      const res = await fetch('/api/challenge/questions?limit=5');
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions);
        setAnswers({});
        setResult(null);
        setCurrentQIndex(0);
      }
    } catch (err) {
      toast.error('获取题目失败');
    }
  };

  const fetchBoss = async () => {
    if (!classId) return;
    try {
      const res = await fetch(`/api/challenge/boss/active/${classId}`);
      const data = await res.json();
      if (data.success) {
        setBoss(data.boss);
      }
    } catch (err) {
      toast.error('获取Boss失败');
    }
  };

  const getOptionsArray = (options: any): string[] => {
    if (Array.isArray(options)) return options;
    if (typeof options === 'string') {
      try {
        const parsed = JSON.parse(options);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  };

  const handleAnswer = (questionId: number, answer: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      toast.error('请回答完所有问题');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/challenge/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user?.studentId,
          answers
        })
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        toast.success(`挑战完成！得分: ${data.score}`);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error('提交失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttackBoss = async () => {
    if (!boss || isAttacking) return;
    setIsAttacking(true);
    try {
      const res = await fetch(`/api/challenge/boss/${boss.id}/attack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user?.studentId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`造成了 ${data.damage} 点伤害！`);
        if (data.defeated) {
          toast.success(`击败了Boss！获得了 ${data.rewardPoints} 积分！`);
          setBoss(null);
        } else {
          setBoss(prev => prev ? { ...prev, hp: data.newHp } : null);
        }
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error('攻击失败');
    } finally {
      setIsAttacking(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Tabs */}
      <div className="flex justify-center space-x-6 mb-8">
        <motion.button
          whileHover={{ y: -4 }}
          whileTap={{ y: 0 }}
          onClick={() => setActiveTab('questions')}
          className={`flex items-center px-8 py-4 rounded-[2rem] font-black text-xl transition-all border-b-8 ${
            activeTab === 'questions'
              ? 'bg-blue-500 text-white border-blue-700 shadow-xl'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-blue-600'
          }`}
        >
          <Swords className="mr-3 h-8 w-8" />
          答题挑战
        </motion.button>
        <motion.button
          whileHover={{ y: -4 }}
          whileTap={{ y: 0 }}
          onClick={() => setActiveTab('boss')}
          className={`flex items-center px-8 py-4 rounded-[2rem] font-black text-xl transition-all border-b-8 ${
            activeTab === 'boss'
              ? 'bg-red-500 text-white border-red-700 shadow-xl'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          <Flame className="mr-3 h-8 w-8" />
          世界Boss
        </motion.button>
      </div>

      {/* Questions Tab */}
      <AnimatePresence mode="wait">
      {activeTab === 'questions' && (
        <motion.div 
          key="questions"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="bg-white rounded-[2.5rem] p-10 shadow-2xl border-8 border-blue-100"
        >
          {result ? (
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="text-center space-y-8"
            >
              <Trophy className="mx-auto h-32 w-32 text-yellow-400 drop-shadow-xl" />
              <h2 className="text-5xl font-black text-gray-900 drop-shadow-sm">挑战结果</h2>
              <div className="flex justify-center space-x-8 text-xl">
                <div className="p-6 bg-green-100 text-green-800 rounded-[2rem] border-b-8 border-green-300 min-w-[140px]">
                  <p className="text-base font-bold mb-2">正确</p>
                  <p className="text-5xl font-black">{result.correctCount}</p>
                </div>
                <div className="p-6 bg-red-100 text-red-800 rounded-[2rem] border-b-8 border-red-300 min-w-[140px]">
                  <p className="text-base font-bold mb-2">错误</p>
                  <p className="text-5xl font-black">{result.wrongCount}</p>
                </div>
                <div className="p-6 bg-blue-100 text-blue-800 rounded-[2rem] border-b-8 border-blue-300 min-w-[140px] shadow-lg">
                  <p className="text-base font-bold mb-2">得分</p>
                  <p className="text-6xl font-black text-blue-600">{result.score}</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchQuestions}
                className="mt-10 px-12 py-5 bg-blue-500 text-white rounded-[2rem] font-black text-2xl border-b-8 border-blue-700 shadow-xl hover:bg-blue-400"
              >
                再来一次
              </motion.button>
            </motion.div>
          ) : questions.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentQIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="flex justify-between items-center mb-8 bg-gray-50 p-4 rounded-[1.5rem] border-4 border-gray-100">
                  <h3 className="text-2xl font-black text-gray-800 flex items-center">
                    <span className="bg-blue-500 text-white w-10 h-10 flex items-center justify-center rounded-full mr-3 shadow-md">
                      {currentQIndex + 1}
                    </span>
                    <span className="text-gray-400 mx-2">/</span>
                    {questions.length}
                  </h3>
                  <span className="px-5 py-2 bg-blue-100 text-blue-800 rounded-full text-lg font-black border-b-4 border-blue-200">
                    {questions[currentQIndex].type === 'SINGLE' ? '单选题' : questions[currentQIndex].type === 'MULTIPLE' ? '多选题' : '判断题'}
                  </span>
                </div>
                
                <div className="mb-10">
                  <h4 className="text-3xl font-black text-gray-900 mb-8 leading-tight">{questions[currentQIndex].title}</h4>
                  <div className="space-y-4">
                    {questions[currentQIndex].type === 'JUDGE' ? (
                      ['正确', '错误'].map((opt) => (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          key={opt}
                          onClick={() => handleAnswer(questions[currentQIndex].id, opt)}
                          className={`w-full text-left p-6 rounded-[1.5rem] border-4 transition-all text-xl font-bold ${
                            answers[questions[currentQIndex].id] === opt
                              ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-md'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                          }`}
                        >
                          {opt}
                        </motion.button>
                      ))
                    ) : (
                      getOptionsArray(questions[currentQIndex].options).map((opt, idx) => {
                        const isMultiple = questions[currentQIndex].type === 'MULTIPLE';
                        const isSelected = isMultiple
                          ? (answers[questions[currentQIndex].id] || []).includes(opt)
                          : answers[questions[currentQIndex].id] === opt;
                        const labels = ['A', 'B', 'C', 'D', 'E', 'F'];

                        return (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            key={opt}
                            onClick={() => {
                              if (isMultiple) {
                                const curr = answers[questions[currentQIndex].id] || [];
                                const next = curr.includes(opt)
                                  ? curr.filter((o: string) => o !== opt)
                                  : [...curr, opt];
                                handleAnswer(questions[currentQIndex].id, next);
                              } else {
                                handleAnswer(questions[currentQIndex].id, opt);
                              }
                            }}
                            className={`w-full text-left p-6 rounded-[1.5rem] border-4 transition-all text-xl font-bold flex items-center ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-md'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                            }`}
                          >
                            <span className={`w-10 h-10 flex items-center justify-center rounded-xl mr-4 ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                              {labels[idx]}
                            </span>
                            {opt}
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex justify-between mt-10 border-t-4 border-gray-100 pt-8">
                  <motion.button
                    whileHover={currentQIndex !== 0 ? { scale: 1.05 } : {}}
                    whileTap={currentQIndex !== 0 ? { scale: 0.95 } : {}}
                    disabled={currentQIndex === 0}
                    onClick={() => setCurrentQIndex(i => i - 1)}
                    className="px-8 py-4 rounded-[1.5rem] font-black text-lg bg-gray-100 text-gray-500 border-b-4 border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一题
                  </motion.button>
                  {currentQIndex === questions.length - 1 ? (
                    <motion.button
                      whileHover={!isSubmitting ? { scale: 1.05, y: -4 } : {}}
                      whileTap={!isSubmitting ? { scale: 0.95 } : {}}
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="px-10 py-4 rounded-[1.5rem] font-black text-lg bg-green-500 text-white border-b-8 border-green-700 hover:bg-green-400 disabled:opacity-50 shadow-lg"
                    >
                      {isSubmitting ? '提交中...' : '提交试卷'}
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.05, y: -4 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCurrentQIndex(i => i + 1)}
                      className="px-10 py-4 rounded-[1.5rem] font-black text-lg bg-blue-500 text-white border-b-8 border-blue-700 hover:bg-blue-400 shadow-lg"
                    >
                      下一题
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="text-center py-20 text-gray-500">
              <AlertCircle className="mx-auto h-20 w-20 mb-6 text-gray-300" />
              <p className="text-2xl font-bold">暂无题目数据</p>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* Boss Tab */}
      <AnimatePresence mode="wait">
      {activeTab === 'boss' && (
        <motion.div 
          key="boss"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-[2.5rem] p-10 shadow-2xl border-8 border-red-200 text-center relative overflow-hidden"
        >
          {boss ? (
            <div className="space-y-8 relative z-10">
              <motion.div 
                animate={{ y: [0, -20, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="mx-auto w-48 h-48 bg-red-100 rounded-full flex items-center justify-center mb-8 border-8 border-red-300 shadow-xl"
              >
                <Flame className="w-24 h-24 text-red-500 drop-shadow-lg" />
              </motion.div>
              <h2 className="text-5xl font-black text-gray-900 drop-shadow-sm">{boss.name}</h2>
              <p className="text-xl font-bold text-gray-500 max-w-lg mx-auto">{boss.description}</p>
              
              <div className="bg-gray-200 rounded-[2rem] h-10 w-full max-w-2xl mx-auto overflow-hidden relative border-4 border-gray-300 shadow-inner mt-8">
                <motion.div 
                  className="bg-gradient-to-r from-red-500 to-red-400 h-full relative"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, (boss.hp / boss.max_hp) * 100)}%` }}
                  transition={{ type: "spring", bounce: 0.5 }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full h-1/2"></div>
                </motion.div>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-white drop-shadow-md">
                  HP: {boss.hp} / {boss.max_hp}
                </div>
              </div>
              
              <motion.button
                whileHover={!isAttacking && boss.hp > 0 ? { scale: 1.1, y: -5 } : {}}
                whileTap={!isAttacking && boss.hp > 0 ? { scale: 0.9 } : {}}
                onClick={handleAttackBoss}
                disabled={isAttacking || boss.hp <= 0}
                className="mt-12 px-16 py-6 bg-red-500 text-white rounded-[2rem] font-black text-3xl border-b-8 border-red-700 hover:bg-red-400 disabled:opacity-50 shadow-2xl shadow-red-500/40"
              >
                {isAttacking ? '攻击中...' : boss.hp <= 0 ? 'Boss已被击败' : '发起攻击！'}
              </motion.button>
            </div>
          ) : (
            <div className="py-20 text-gray-400 flex flex-col items-center">
              <Shield className="w-24 h-24 text-gray-200 mb-6" />
              <h3 className="text-3xl font-black text-gray-600">当前没有出现世界Boss</h3>
              <p className="mt-4 text-xl font-bold">请等待老师开启</p>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
