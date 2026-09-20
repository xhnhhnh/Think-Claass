import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Edit, Plus, Trash2, Users } from 'lucide-react';

import { adminClient } from '@/features/admin/api/adminClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';

interface Teacher {
  id: number;
  username: string;
  role: string;
}

/**
 * 教师管理.
 *
 * The template for this phase's list pages: `PageHeader` + `DataTable` (which owns
 * loading and empty) + `Dialog` for the form + `ConfirmDialog` for the delete. Before,
 * this file hand-wrote a `<table>`, its own spinner, its own empty block, a fixed-overlay
 * modal and a `window.confirm`.
 */
export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      setTeachers(await adminClient.getTeachers());
    } catch (error) {
      toast.error('网络错误，无法获取教师数据');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleOpenModal = (teacher?: Teacher) => {
    if (teacher) {
      setEditingId(teacher.id);
      setFormData({ username: teacher.username, password: '' });
    } else {
      setEditingId(null);
      setFormData({ username: '', password: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim()) {
      toast.error('用户名不能为空');
      return;
    }
    if (!editingId && !formData.password) {
      toast.error('密码不能为空');
      return;
    }

    try {
      const data = editingId
        ? await adminClient.updateTeacher(editingId, {
            username: formData.username.trim(),
            password: formData.password || undefined,
          })
        : await adminClient.createTeacher({ username: formData.username.trim(), password: formData.password });
      if (data.success) {
        toast.success(editingId ? '教师更新成功' : '教师创建成功');
        handleCloseModal();
        fetchTeachers();
      } else {
        toast.error(data.message || '操作失败');
      }
    } catch (error) {
      toast.error('网络错误，操作失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const data = await adminClient.deleteTeacher(deleteTarget.id);
      if (data.success) {
        toast.success('教师已删除');
        setDeleteTarget(null);
        fetchTeachers();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (error) {
      toast.error('网络错误，删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="教师管理"
        description="管理系统中的所有教师账号"
        icon={Users}
        actions={
          <Button onClick={() => handleOpenModal()}>
            <Plus data-icon="inline-start" />
            添加教师
          </Button>
        }
      />

      <DataTable<Teacher>
        columns={[
          { key: 'id', header: 'ID', className: 'text-ink-2' },
          { key: 'username', header: '用户名', className: 'font-medium text-ink-1' },
          {
            key: 'role',
            header: '角色',
            render: (teacher) => (
              <Badge variant="info">{teacher.role === 'teacher' ? '教师' : teacher.role}</Badge>
            ),
          },
          {
            key: 'actions',
            header: <span className="sr-only">操作</span>,
            align: 'right',
            render: (teacher) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`编辑${teacher.username}`}
                  title="编辑"
                  onClick={() => handleOpenModal(teacher)}
                >
                  <Edit />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除${teacher.username}`}
                  title="删除"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(teacher)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]}
        rows={teachers}
        getRowKey={(teacher) => teacher.id}
        isLoading={loading}
        empty={
          <EmptyState
            icon={Users}
            title="暂无教师"
            description="点击上方按钮添加第一位教师"
            className="bg-card"
          />
        }
      />

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑教师' : '添加教师'}</DialogTitle>
            <DialogDescription>教师账号用于登录教师主控台</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="用户名">
              <Input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名"
                required
              />
            </FormField>
            <FormField label={editingId ? '新密码 (留空表示不修改)' : '密码'}>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingId ? '输入新密码' : '请输入密码'}
                required={!editingId}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal}>
                取消
              </Button>
              <Button type="submit">{editingId ? '保存修改' : '创建教师'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确认删除教师"
        description={
          deleteTarget
            ? `确定要删除“${deleteTarget.username}”吗？所有相关的班级、学生和记录将被永久删除！`
            : undefined
        }
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
