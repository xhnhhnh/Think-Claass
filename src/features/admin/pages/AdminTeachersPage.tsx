import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Edit, Plus, Search, Trash2, Users } from 'lucide-react';

import { adminClient } from '@/features/admin/api/adminClient';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Avatar } from '@/components/ui/avatar';
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
import { KpiStrip } from '@/components/ui/kpi-strip';
import { PageScaffold } from '@/components/ui/page-scaffold';

interface Teacher {
  id: number;
  username: string;
  role: string;
  isActivated?: boolean;
}

/**
 * 教师管理.
 *
 * The template for this phase's list pages: `PageScaffold variant="list"` (the toolbar
 * slot stays empty because this list has never had a search or a filter) + `DataTable`
 * (which owns loading and empty) + `Dialog` for the form + `ConfirmDialog` for the
 * delete. Before, this file hand-wrote a `<table>`, its own spinner, its own empty
 * block, a fixed-overlay modal and a `window.confirm`.
 *
 * The heading is the scaffold's `title`, which the shell suppresses while it renders the
 * `h1` from the route table, plus the page's动作 in the context bar. 添加教师 is
 * registered with the command palette as well, so `⌘K` reaches it.
 */
export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /** One save at a time: a double click on 创建教师 used to create two accounts. */
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [search, setSearch] = useState('');

  const fetchTeachers = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setTeachers(await adminClient.getTeachers());
    } catch {
      // `@/lib/api` already showed the server's sentence; the flag below is what survives the toast.
      setLoadError(true);
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
    if (saving) return;
    if (!formData.username.trim()) {
      toast.error('用户名不能为空');
      return;
    }
    if (!editingId && !formData.password) {
      toast.error('密码不能为空');
      return;
    }

    setSaving(true);
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
    } catch {
      // The api layer already showed the server's sentence; the dialog and the typed values stay.
    } finally {
      setSaving(false);
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
    } catch {
      // The api layer already showed the server's sentence; the confirmation stays open to retry.
    } finally {
      setIsDeleting(false);
    }
  };

  // The page's one 主要动作, registered with the command palette as well as the context bar.
  useRegisterPageCommands([
    {
      id: 'admin-teachers:create',
      label: '添加教师',
      icon: Plus,
      keywords: ['教师', '新增', '账号'],
      run: () => handleOpenModal(),
    },
  ]);

  const query = search.trim().toLowerCase();
  const visibleTeachers = query
    ? teachers.filter((teacher) => teacher.username.toLowerCase().includes(query))
    : teachers;
  const activatedCount = teachers.filter((teacher) => teacher.isActivated).length;

  return (
    <PageScaffold
      variant="list"
      title="教师管理"
      description="管理教师账号、登录状态与班级归属"
      actions={
        <Button onClick={() => handleOpenModal()}>
          <Plus data-icon="inline-start" />
          添加教师
        </Button>
      }
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3"
            />
            <Input
              type="search"
              aria-label="搜索教师用户名"
              placeholder="搜索教师用户名"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <p className="text-caption text-fg-3">
            共 {teachers.length} 位教师 · 已激活 {activatedCount} 位
          </p>
        </div>
      }
    >
      <KpiStrip
        items={[
          { label: '教师总数', value: teachers.length, icon: Users, tone: 'role' },
          { label: '已激活', value: activatedCount, icon: Users, tone: 'success' },
          { label: '待激活', value: Math.max(0, teachers.length - activatedCount), icon: Users, tone: 'warning' },
        ]}
      />

      <DataTable<Teacher>
        columns={[
          {
            key: 'username',
            header: '教师',
            render: (teacher) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={teacher.username} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg-1">{teacher.username}</div>
                  <div className="text-caption text-fg-3">#{teacher.id}</div>
                </div>
              </div>
            ),
          },
          {
            key: 'role',
            header: '角色',
            render: (teacher) => (
              <Badge variant="info">{teacher.role === 'teacher' ? '教师' : teacher.role}</Badge>
            ),
          },
          {
            key: 'status',
            header: '状态',
            render: (teacher) => (
              <Badge variant={teacher.isActivated ? 'success' : 'secondary'}>
                {teacher.isActivated ? '已激活' : '待激活'}
              </Badge>
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
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setDeleteTarget(teacher)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]}
        rows={visibleTeachers}
        getRowKey={(teacher) => teacher.id}
        isLoading={loading}
        error={loadError}
        onRetry={() => void fetchTeachers()}
        empty={
          <EmptyState
            icon={Users}
            title={query ? '没有匹配的教师' : '暂无教师'}
            description={query ? '换一个用户名试试。' : '点击右上角「添加教师」创建第一位教师。'}
            className="bg-surface-2"
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
              <Button type="submit" disabled={saving}>
                {saving ? '保存中...' : editingId ? '保存修改' : '创建教师'}
              </Button>
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
    </PageScaffold>
  );
}
