import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { UserCog, Save, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { authApi } from '@/features/auth/api/authApi';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';

/**
 * 个人设置.
 *
 * The form's contract is the one the page test pins: three placeholder strings
 * identify the controls, and the submit button is matched as `/保存更改/`. The
 * placeholders and the `保存中...`/`保存更改` swap are therefore untouched - only the
 * surfaces and the controls moved onto the kit.
 *
 * The absolutely positioned icons the old inputs drew inside their own padding are
 * gone with them: `Input` owns its padding, so an overlay icon would sit under the
 * text. The two section headings keep their `Lock` affordance.
 */
export default function TeacherSettings() {
  const { user, setUser } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('用户名不能为空');
      return;
    }
    if (password && password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }

    setSaving(true);
    try {
      const data = await authApi.updateProfile({
        username: username.trim(),
        password: password || undefined,
      });

      if (data.success) {
        toast.success('个人信息更新成功');
        setPassword('');
        setConfirmPassword('');
        if (user) {
          const updatedUser = data.user ?? data.data?.user;
          setUser({
            ...user,
            username: updatedUser?.username ?? username.trim(),
            is_activated: updatedUser?.is_activated ?? user.is_activated,
          });
        }
      } else {
        toast.error(data.message || '更新失败');
      }
    } catch (err) {
      console.error('Update settings error:', err);
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="个人设置" description="修改您的登录账号和密码" icon={UserCog} />

      <div className="rounded-panel border border-border bg-paper p-8 shadow-card">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <FormField label="用户名">
              <Input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入新的用户名"
              />
            </FormField>
            <p className="text-xs text-ink-3">注意：修改用户名后，下次登录请使用新用户名。</p>
          </div>

          <div className="space-y-6 border-t border-border pt-6">
            <h3 className="flex items-center text-sm font-bold text-ink-1">
              <Lock aria-hidden="true" className="mr-2 h-4 w-4 text-ink-3" />
              修改密码 (不修改请留空)
            </h3>

            <FormField label="新密码">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入新密码"
              />
            </FormField>

            <FormField label="确认新密码">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
              />
            </FormField>
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" disabled={saving} className="w-full">
              {saving ? <Spinner size="sm" label="保存中" /> : <Save data-icon="inline-start" />}
              {saving ? '保存中...' : '保存更改'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
