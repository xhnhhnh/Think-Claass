import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Key, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { authApi } from '@/api/auth';

export default function Activate() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const navigate = useNavigate();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error('请输入激活码');
      return;
    }

    setLoading(true);
    try {
      const data = await authApi.activate({ code: code.trim(), userId: user?.id }) as any;

      if (data.success) {
        toast.success('激活成功！欢迎加入 Think-Class');
        if (user) {
          setUser({ ...user, is_activated: true });
        }
        if (user?.role === 'student') {
          navigate('/student');
        } else if (user?.role === 'parent') {
          navigate('/parent');
        } else {
          navigate('/');
        }
      } else {
        toast.error(data.message || '激活失败');
      }
    } catch (err) {
      toast.error('网络错误，无法连接到服务器');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden"
      >
        <div className="p-8 text-center bg-indigo-600">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Key className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">输入激活码</h2>
          <p className="text-indigo-100 text-sm">此账号需要激活后才能使用系统的全部功能</p>
        </div>

        <form onSubmit={handleActivate} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              激活码
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="请输入 12 位专属激活码"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all uppercase text-center tracking-widest font-mono text-lg"
              maxLength={12}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !code}
            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                立即激活 <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => {
              useStore.getState().logout();
              navigate('/login');
            }}
            className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            退出登录
          </button>
        </form>
      </motion.div>
    </div>
  );
}