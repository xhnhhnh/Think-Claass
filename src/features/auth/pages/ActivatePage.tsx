import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Key, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { authApi } from '@/features/auth/api/authApi';

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
    <div className="public-campus-page flex min-h-screen items-center justify-center bg-[var(--campus-canvas)] p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md overflow-hidden rounded-lg border border-[var(--campus-border)] bg-white shadow-sm"
      >
        <div className="bg-gradient-to-r from-emerald-50 via-white to-orange-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
            <Key className="w-8 h-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-950">输入激活码</h2>
          <p className="text-sm text-slate-500">此账号需要激活后才能使用系统的全部功能</p>
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
              className="w-full rounded-lg border border-[var(--campus-border)] px-4 py-3 text-center font-mono text-lg uppercase tracking-widest outline-none transition-all focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              maxLength={12}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !code}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-700 py-3.5 font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
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
