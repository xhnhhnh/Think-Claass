import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Save, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { authApi } from '@/features/auth/api/authApi';
import { RestartGuideCard } from '@/features/onboarding/RestartGuideCard';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/ui/select';
import { useShellStore, type ThemeMode } from '@/app/shell/shellStore';

/**
 * 个人设置 - one page for all four roles.
 *
 * ## Why it moved here
 *
 * This began life as `features/classroom/pages/TeacherSettingsPage.tsx`, which was wrong twice: it
 * changes the *account* (username and password through `PUT /api/auth/profile`) and has never had
 * anything to do with a class, and only a teacher could reach it because only a teacher had a
 * settings route. Students and parents had no settings surface at all, so the opening guide's
 * "重新开始引导" action had nowhere to live for them.
 *
 * It now sits in the auth tree beside `LoginPage` and `ActivatePage` - the other two pages that are
 * about an account rather than a domain - and the route table gives every role a path to it:
 * `/teacher/settings`, `/student/settings`, `/parent/settings` and `<admin>/profile`.
 *
 * ## What is deliberately unchanged
 *
 * The form's contract is the one the page test pins: three placeholder strings identify the
 * controls and the submit button is matched as `/保存更改/`. The placeholders and the
 * `保存中...`/`保存更改` swap are untouched, because rewriting them would be a copy change smuggled
 * into a move.
 *
 * The route table mounts this page inside all four consoles (teacher, student, parent and
 * admin settings), so it is a console page: the shape is `PageScaffold variant="detail"` and
 * the `PageHeader` is gone. 保存更改 is registered with the command palette as well - the
 * page's one 主要动作 - and the button stays inside the form where it has always been.
 */
export default function ProfileSettings() {
  const { user, setUser } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const theme = useShellStore((state) => state.theme);
  const setTheme = useShellStore((state) => state.setTheme);

  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user]);

  /** `event` is optional so the command palette can run the same save the form's button does. */
  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
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

  useRegisterPageCommands([
    {
      id: 'profile-settings:save',
      label: '保存更改',
      icon: Save,
      keywords: ['个人设置', '账号', '密码', '保存'],
      run: () => void handleSave(),
      disabled: saving,
    },
  ]);

  return (
    <PageScaffold variant="detail" title="个人设置" description="修改您的登录账号和密码">
      <div className="rounded-panel border border-line-1 bg-surface-2 p-8 shadow-card">
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
            <p className="text-xs text-fg-3">注意：修改用户名后，下次登录请使用新用户名。</p>
          </div>

          <div className="space-y-6 border-t border-line-1 pt-6">
            <h3 className="flex items-center text-sm font-bold text-fg-1">
              <Lock aria-hidden="true" className="mr-2 h-4 w-4 text-fg-3" />
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

      <section className="mt-4 rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card" aria-label="外观设置">
        <h2 className="font-semibold text-fg-1">外观设置</h2>
        <p className="mt-1 text-sm text-fg-3">选择适合当前环境的界面颜色，设置会立即生效。</p>
        <label className="mt-4 block max-w-xs text-sm font-medium text-fg-2">
          主题
          <Select value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)} className="mt-1">
            <option value="light">浅色</option>
            <option value="dark">深色</option>
            <option value="system">跟随系统</option>
          </Select>
        </label>
      </section>

      <RestartGuideCard />
    </PageScaffold>
  );
}
