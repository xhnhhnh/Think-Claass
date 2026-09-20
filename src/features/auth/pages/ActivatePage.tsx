import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { ArrowRight, Key } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { authApi } from '@/features/auth/api/authApi';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

/**
 * Activation-code entry.
 *
 * Composed from the kit, so the card, the field and the button come from the same
 * tokens as the login page next door - and dropping `public-campus-page` here is
 * what lets P3 delete the recolour block that block was compensating for.
 */
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
      const data = (await authApi.activate({ code: code.trim(), userId: user?.id })) as any;

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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md overflow-hidden rounded-panel border border-border bg-paper shadow-sm"
      >
        <div className="bg-gradient-to-r from-emerald-50 via-white to-orange-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-paper text-primary shadow-sm">
            <Key className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-ink-1">输入激活码</h2>
          <p className="text-sm text-ink-3">此账号需要激活后才能使用系统的全部功能</p>
        </div>

        <form onSubmit={handleActivate} className="space-y-6 p-8">
          <FormField label="激活码">
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="请输入 12 位专属激活码"
              maxLength={12}
              className="h-12 text-center font-mono text-lg uppercase tracking-widest"
            />
          </FormField>

          <Button
            type="submit"
            size="lg"
            disabled={loading || !code}
            className="h-12 w-full font-bold"
          >
            {loading ? (
              <Spinner label="正在激活" className="text-primary-foreground" />
            ) : (
              <>
                立即激活 <ArrowRight data-icon="inline-end" />
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-ink-3 hover:text-ink-1"
            onClick={() => {
              useStore.getState().logout();
              navigate('/login');
            }}
          >
            退出登录
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
