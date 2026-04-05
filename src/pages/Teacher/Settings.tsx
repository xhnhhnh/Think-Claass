import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { UserCog, Save, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

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
      const res = await fetch(`/api/admin/users/${user?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password || undefined }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('个人信息更新成功');
        setPassword('');
        setConfirmPassword('');
        // Update local store
        if (user) {
          setUser({ ...user, username: data.user.username });
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
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center mb-8 pb-6 border-b border-white/60">
          <div className="p-3 bg-blue-100 rounded-xl mr-4">
            <UserCog className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">个人设置</h2>
            <p className="text-slate-500 mt-1">修改您的登录账号和密码</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">用户名</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="请输入新的用户名"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">注意：修改用户名后，下次登录请使用新用户名。</p>
          </div>

          <div className="pt-4 border-t border-white/60 space-y-6">
            <h3 className="text-sm font-bold text-slate-800 flex items-center">
              <Lock className="w-4 h-4 mr-2 text-gray-400" />
              修改密码 (不修改请留空)
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">新密码</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="请输入新密码"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">确认新密码</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="请再次输入新密码"
                />
              </div>
            </div>
          </div>
          
          <div className="pt-6">
            <button
              type="submit"
              disabled={saving}
              className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-5 h-5 mr-2" />
              {saving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
