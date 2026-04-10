import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { BookOpen, User, Lock, Loader2, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { authApi } from '@/api/auth';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState('student');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [students, setStudents] = useState<{id: number, name: string}[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [fetchingStudents, setFetchingStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setUser = useStore((state) => state.setUser);

  const handleInviteCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase();
    setInviteCode(code);
    
    if (code.length === 6) {
      setFetchingStudents(true);
      try {
        const data = await authApi.verifyInviteCode(code, role) as any;
        if (data.success) {
          setStudents(data.students);
          if (data.students.length > 0) {
            setSelectedStudentId(data.students[0].id);
          } else {
            setSelectedStudentId(null);
          }
          setError('');
        } else {
          setStudents([]);
          setSelectedStudentId(null);
          setError(data.message);
        }
      } catch (err) {
        setError('获取班级学生列表失败');
      } finally {
        setFetchingStudents(false);
      }
    } else {
      setStudents([]);
      setSelectedStudentId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = isLogin 
        ? { username, password, role }
        : { username, password, role, name: students.find(s => s.id === selectedStudentId)?.name || '', invite_code: inviteCode, student_id: selectedStudentId };

      const data = isLogin 
        ? await authApi.login(payload) as any
        : await authApi.register(payload) as any;

      if (data.success) {
        if (isLogin) {
          setUser(data.user);
          if (data.user.role === 'teacher') {
            navigate('/teacher');
          } else if (data.user.role === 'parent') {
            navigate('/parent/dashboard');
          } else {
            navigate('/student/pet');
          }
        } else {
          setIsLogin(true);
          setError((role === 'student' || role === 'parent') ? '绑定成功，请使用新账号登录' : '注册成功，请登录');
        }
      } else {
        setError(data.message || 'An error occurred');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfaf5] text-[#5c4b3a] selection:bg-[#f2c779] selection:text-white font-sans overflow-hidden relative flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Background Texture Overlay */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-0" 
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />
      
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#f2c779] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8fb9a8] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse animation-delay-2000 pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="absolute left-0 top-0 mt-2 sm:left-auto sm:right-full sm:mr-4">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center text-sm font-medium text-[#7d6b5a] hover:text-[#d97757] transition-colors bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm border border-[#f0e6d3]"
          >
            ← 返回官网
          </button>
        </div>
        <div className="mx-auto flex justify-center items-center h-20 w-20 rounded-[2rem] bg-[#fdf4f1] border border-[#f0e6d3] shadow-inner mt-10 rotate-3">
          <Heart className="h-10 w-10 text-[#d97757] fill-current" />
        </div>
        <h2 className="mt-8 text-center text-3xl md:text-4xl font-extrabold text-[#4a3b2c] tracking-tight">
          Think-Class
        </h2>
        <p className="mt-3 text-center text-[15px] text-[#7d6b5a]">
          {isLogin ? '登录你的账号' : ((role === 'student' || role === 'parent') ? '使用邀请码激活绑定账号' : '注册新账号')}
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="bg-white/80 backdrop-blur-md py-10 px-6 shadow-xl sm:rounded-[2.5rem] sm:px-12 border border-[#f0e6d3]">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="flex justify-center space-x-2 mb-8 bg-[#fcfaf5] p-2 rounded-full border border-[#f0e6d3]">
              <button
                type="button"
                onClick={() => {
                  setRole('student');
                  setIsLogin(true); // Default to login tab
                }}
                className={`flex-1 px-2 py-3 rounded-full text-sm font-bold transition-all ${
                  role === 'student' ? 'bg-[#8fb9a8] text-white shadow-md' : 'text-[#7d6b5a] hover:bg-white/50'
                }`}
              >
                我是学生
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole('parent');
                  setIsLogin(true); // Default to login tab
                }}
                className={`flex-1 px-2 py-3 rounded-full text-sm font-bold transition-all ${
                  role === 'parent' ? 'bg-[#d97757] text-white shadow-md' : 'text-[#7d6b5a] hover:bg-white/50'
                }`}
              >
                我是家长
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole('teacher');
                  setIsLogin(true); // Default to login tab
                }}
                className={`flex-1 px-2 py-3 rounded-full text-sm font-bold transition-all ${
                  role === 'teacher' ? 'bg-[#e8b560] text-white shadow-md' : 'text-[#7d6b5a] hover:bg-white/50'
                }`}
              >
                我是老师
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`p-4 text-sm rounded-2xl ${error.includes('successful') || error.includes('成功') ? 'bg-[#f1f8f5] text-[#4a3b2c] border border-[#8fb9a8]/30' : 'bg-[#fdf4f1] text-[#4a3b2c] border border-[#d97757]/30'}`}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-[#7d6b5a] mb-2 ml-1">账号</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-[#bbaea0]" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`block w-full pl-12 pr-4 py-3.5 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:outline-none transition-all text-[#5c4b3a] placeholder:text-[#bbaea0] ${role === 'teacher' ? 'focus:ring-[#e8b560]/30 focus:border-[#e8b560]' : role === 'parent' ? 'focus:ring-[#d97757]/30 focus:border-[#d97757]' : 'focus:ring-[#8fb9a8]/30 focus:border-[#8fb9a8]'}`}
                    placeholder="输入账号"
                  />
                </div>
              </div>

              {(role === 'student' || role === 'parent') && !isLogin && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[#f0e6d3]" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white text-[#bbaea0] font-medium">
                        {role === 'parent' ? '绑定班级与孩子' : '班级邀请码绑定'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
              
              {!isLogin && (role === 'student' || role === 'parent') && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-[#7d6b5a] mb-2 ml-1">班级邀请码</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-[#bbaea0]" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={inviteCode}
                        onChange={handleInviteCodeChange}
                        className={`block w-full pl-12 pr-4 py-3.5 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:outline-none transition-all text-[#5c4b3a] placeholder:text-[#bbaea0] uppercase ${role === 'parent' ? 'focus:ring-[#d97757]/30 focus:border-[#d97757]' : 'focus:ring-[#8fb9a8]/30 focus:border-[#8fb9a8]'}`}
                        placeholder="输入6位班级邀请码"
                      />
                    </div>
                  </div>

                  {fetchingStudents ? (
                    <div className="text-sm text-[#7d6b5a] flex items-center justify-center py-2">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin text-[#8fb9a8]" />
                      正在寻找小伙伴...
                    </div>
                  ) : (
                    inviteCode.length === 6 && students.length === 0 ? (
                      <div className="p-4 text-sm rounded-2xl bg-[#fdf4f1] text-[#4a3b2c] border border-[#d97757]/30 text-center">未找到班级或所有小伙伴都已绑定啦</div>
                    ) : inviteCode.length === 6 && students.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <label className="block text-sm font-bold text-[#7d6b5a] mb-2 ml-1">我是谁</label>
                        <select
                          required
                          value={selectedStudentId || ''}
                          onChange={(e) => setSelectedStudentId(Number(e.target.value))}
                          className={`block w-full pl-4 pr-10 py-3.5 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:outline-none transition-all text-[#5c4b3a] ${role === 'parent' ? 'focus:ring-[#d97757]/30 focus:border-[#d97757]' : 'focus:ring-[#8fb9a8]/30 focus:border-[#8fb9a8]'}`}
                        >
                          <option value="" disabled>{role === 'parent' ? '请选择您的孩子' : '请选择你的名字'}</option>
                          {students.map((student) => (
                            <option key={student.id} value={student.id}>
                              {student.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-[#bbaea0] ml-1">
                          {role === 'parent' ? '选择您要绑定的孩子名字' : '选择老师为你预先添加的名字进行账号绑定'}
                        </p>
                      </motion.div>
                    )
                  )}
                </motion.div>
              )}

              <div>
                <label className="block text-sm font-bold text-[#7d6b5a] mb-2 ml-1">密码</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-[#bbaea0]" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`block w-full pl-12 pr-4 py-3.5 bg-[#fcfaf5] border border-[#f0e6d3] rounded-2xl focus:bg-white focus:ring-2 focus:outline-none transition-all text-[#5c4b3a] placeholder:text-[#bbaea0] ${role === 'teacher' ? 'focus:ring-[#e8b560]/30 focus:border-[#e8b560]' : role === 'parent' ? 'focus:ring-[#d97757]/30 focus:border-[#d97757]' : 'focus:ring-[#8fb9a8]/30 focus:border-[#8fb9a8]'}`}
                    placeholder={role === 'student' && isLogin ? '默认密码: 123456' : '输入密码'}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center items-center py-4 px-4 rounded-2xl shadow-lg text-[15px] font-bold text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed ${
                  role === 'teacher' ? 'bg-[#e8b560] hover:bg-[#d4a04d] shadow-[#e8b560]/20' : role === 'parent' ? 'bg-[#d97757] hover:bg-[#c46142] shadow-[#d97757]/20' : 'bg-[#8fb9a8] hover:bg-[#7ca795] shadow-[#8fb9a8]/20'
                }`}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLogin ? '开启旅程' : ((role === 'student' || role === 'parent') ? '绑定并激活' : '注册新账号')}
              </motion.button>
            </div>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#f0e6d3]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-[#bbaea0] font-medium">
                  {role === 'teacher' ? (isLogin ? '还没有账号？' : '已有账号？') : (isLogin ? '首次使用？' : '已有账号？')}
                </span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className={`font-bold transition-colors ${role === 'teacher' ? 'text-[#e8b560] hover:text-[#d4a04d]' : role === 'parent' ? 'text-[#d97757] hover:text-[#c46142]' : 'text-[#8fb9a8] hover:text-[#7ca795]'}`}
              >
                {role === 'teacher' ? (isLogin ? '注册新账号' : '返回登录') : (isLogin ? '使用邀请码激活绑定' : '返回登录')}
              </button>
            </div>
            
            {role === 'student' && isLogin && (
              <div className="text-center text-xs text-[#bbaea0] mt-5">
                学生账号由老师统一创建并发放，无需自主注册。
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
