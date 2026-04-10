import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ClassItem {
  id: number;
  name: string;
}

interface GroupItem {
  id: number;
  name: string;
}

interface EditStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCount: number;
  classes: ClassItem[];
  groups: GroupItem[];
  onSubmit: (action: 'change_class' | 'change_group' | 'reset_password', value: string) => void;
  submitting: boolean;
}

export function EditStudentsModal({
  isOpen,
  onClose,
  targetCount,
  classes,
  groups,
  onSubmit,
  submitting
}: EditStudentsModalProps) {
  const [action, setAction] = React.useState<'change_class' | 'change_group' | 'reset_password'>('change_class');
  const [value, setValue] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value && action !== 'reset_password') return;
    if (action === 'reset_password' && !value) return; // requires password string

    onSubmit(action, value);
    setValue('');
  };

  const handleActionChange = (newAction: typeof action) => {
    setAction(newAction);
    setValue('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white/90 backdrop-blur-xl border-white/60">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-xl font-bold">批量修改学生 ({targetCount}人)</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label>操作类型</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={action === 'change_class' ? 'default' : 'outline'}
                onClick={() => handleActionChange('change_class')}
                className={`w-full ${action === 'change_class' ? 'bg-blue-600 hover:bg-blue-700 text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                修改班级
              </Button>
              <Button
                type="button"
                variant={action === 'change_group' ? 'default' : 'outline'}
                onClick={() => handleActionChange('change_group')}
                className={`w-full ${action === 'change_group' ? 'bg-purple-600 hover:bg-purple-700 text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                修改小组
              </Button>
              <Button
                type="button"
                variant={action === 'reset_password' ? 'default' : 'outline'}
                onClick={() => handleActionChange('reset_password')}
                className={`w-full ${action === 'reset_password' ? 'bg-orange-500 hover:bg-orange-600 text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                重置密码
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {action === 'change_class' && (
              <>
                <Label htmlFor="class-select">选择新班级</Label>
                <select
                  id="class-select"
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                >
                  <option value="">-- 请选择目标班级 --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}

            {action === 'change_group' && (
              <>
                <Label htmlFor="group-select">选择新小组</Label>
                <select
                  id="group-select"
                  className="block w-full border-gray-300 rounded-xl py-2 px-3 border focus:ring-purple-500 focus:border-purple-500 sm:text-sm bg-white"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                >
                  <option value="">-- 请选择目标小组 --</option>
                  <option value="ungrouped">未分组 (移除小组)</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </>
            )}

            {action === 'reset_password' && (
              <>
                <Label htmlFor="new-password">设置新密码</Label>
                <Input
                  id="new-password"
                  type="text"
                  placeholder="至少 6 位字符"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">选中的所有学生密码都将被重置为此新密码。</p>
              </>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting || !value} className="bg-slate-800 hover:bg-slate-900">
              {submitting ? '提交中...' : '确认修改'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
