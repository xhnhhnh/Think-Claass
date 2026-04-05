import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Settings, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ADMIN_PATH } from "@/constants";

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useStore((state) => state.setUser);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      
      if (data.success) {
        setUser(data.user);
        navigate(ADMIN_PATH);
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      setError('网络或服务器错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfaf5] flex flex-col items-center justify-center px-4 relative overflow-hidden font-sans text-[#5c4b3a] selection:bg-[#f2c779] selection:text-white">
      {/* Background Texture Overlay */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none z-0" 
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />
      
      {/* Decorative Orbs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#8fb9a8] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#d97757] rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse animation-delay-2000 pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="absolute -top-16 left-0">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center text-sm font-medium text-[#7d6b5a] hover:text-[#d97757] transition-colors bg-white/80 backdrop-blur-xl/60 backdrop-blur-sm px-4 py-2 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#f0e6d3]"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回官网
          </button>
        </div>

        <div className="bg-white/80 backdrop-blur-xl/80 backdrop-blur-xl rounded-[2.5rem] shadow-xl p-10 md:p-12 border border-[#f0e6d3]">
          <div className="text-center mb-10">
            <motion.div 
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.5 }}
              className="mx-auto h-20 w-20 bg-[#f1f8f5] flex items-center justify-center rounded-[2rem] mb-6 shadow-inner border border-[#f0e6d3]"
            >
              <ShieldCheck className="h-10 w-10 text-[#8fb9a8]" />
            </motion.div>
            <h2 className="text-3xl font-extrabold text-[#4a3b2c] tracking-tight">Think-Class 管理后台</h2>
            <p className="mt-3 text-[15px] text-[#7d6b5a] font-medium">Think-Class Admin Dashboard</p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 p-4 bg-[#fdf4f1] border border-[#d97757]/30 text-[#4a3b2c] text-sm font-medium rounded-2xl"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-[#7d6b5a] mb-2 ml-1">
                管理员账号
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-[#f0e6d3] focus:border-[#8fb9a8] focus:ring-2 focus:ring-[#8fb9a8]/20 transition-all bg-[#fcfaf5] focus:bg-white/80 backdrop-blur-xl text-[#4a3b2c] outline-none placeholder:text-[#bbaea0]"
                placeholder="输入超级管理员账号"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#7d6b5a] mb-2 ml-1">
                密码
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-[#f0e6d3] focus:border-[#8fb9a8] focus:ring-2 focus:ring-[#8fb9a8]/20 transition-all bg-[#fcfaf5] focus:bg-white/80 backdrop-blur-xl text-[#4a3b2c] outline-none placeholder:text-[#bbaea0]"
                placeholder="••••••••"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="mt-4 w-full bg-[#4a3b2c] text-white py-4 px-4 rounded-2xl font-bold hover:bg-[#5c4b3a] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#4a3b2c]/20 text-[15px]"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  验证中...
                </>
              ) : (
                '进入控制台'
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
