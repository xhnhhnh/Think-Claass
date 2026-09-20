import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Edit, Megaphone, Plus, Trash2 } from 'lucide-react';

import { adminClient } from '@/features/admin/api/adminClient';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';

interface Announcement {
  id: number;
  title: string;
  content: string;
  created_at: string;
  is_active: number;
}

/**
 * 公告管理.
 *
 * The same shape as `AdminTeachersPage`: `PageHeader` + `DataTable` (which owns the
 * loading skeleton and the empty state) + `Dialog` for the form + `ConfirmDialog` for
 * the delete. Before, this file hand-wrote a `<table>` with its own thead, its own
 * `animate-spin` div, its own "暂无公告" block, a fixed-overlay modal and a blocking
 * `confirm()`.
 *
 * There is no `Toolbar` here on purpose: this list has never had a search box or a
 * filter, and adding one would be new behaviour rather than a restyle.
 */
export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The delete moved from an inline `confirm()` to a controlled dialog, so the target
  // row and the in-flight flag are state now - the same two pieces `AdminTeachersPage`
  // keeps for its own delete.
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_active: false
  });

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const items = await adminClient.getAnnouncements();
      setAnnouncements(items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        created_at: item.createdAt ?? '',
        is_active: item.isActive ? 1 : 0,
      })));
    } catch (error) {
      toast.error('网络错误，无法获取公告数据');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingId(announcement.id);
      setFormData({
        title: announcement.title,
        content: announcement.content,
        is_active: announcement.is_active === 1
      });
    } else {
      setEditingId(null);
      setFormData({
        title: '',
        content: '',
        is_active: false
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('标题和内容不能为空');
      return;
    }

    try {
      const payload = { title: formData.title.trim(), content: formData.content.trim(), isActive: formData.is_active };
      const data = editingId
        ? await adminClient.updateAnnouncement(editingId, payload)
        : await adminClient.createAnnouncement(payload);
      if (data.success) {
        toast.success(editingId ? '公告更新成功' : '公告创建成功');
        handleCloseModal();
        fetchAnnouncements();
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
      const data = await adminClient.deleteAnnouncement(deleteTarget.id);

      if (data.success) {
        toast.success('公告已删除');
        // Closed only on success, so a failure keeps the confirmation on screen with
        // its error toast, exactly as the old `confirm()` flow ended in a retry.
        setDeleteTarget(null);
        fetchAnnouncements();
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
        title="公告管理"
        description="管理系统中展示给所有用户的全局公告"
        icon={Megaphone}
        actions={
          <Button onClick={() => handleOpenModal()}>
            <Plus data-icon="inline-start" />
            发布新公告
          </Button>
        }
      />

      <DataTable<Announcement>
        columns={[
          { key: 'title', header: '标题', className: 'font-medium text-ink-1' },
          { key: 'content', header: '内容摘要', className: 'max-w-xs truncate text-ink-2' },
          {
            key: 'is_active',
            header: '状态',
            // `is_active` is the API's 1/0 flag, and the two chips it drew by hand were
            // an emerald pair and a slate pair - the `success` and `secondary` badges.
            render: (announcement) =>
              announcement.is_active === 1 ? (
                <Badge variant="success">活动中</Badge>
              ) : (
                <Badge variant="secondary">未激活</Badge>
              ),
          },
          {
            key: 'created_at',
            header: '创建时间',
            className: 'text-ink-3',
            render: (announcement) => new Date(announcement.created_at).toLocaleString(),
          },
          {
            key: 'actions',
            header: <span className="sr-only">操作</span>,
            align: 'right',
            render: (announcement) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`编辑${announcement.title}`}
                  title="编辑"
                  onClick={() => handleOpenModal(announcement)}
                >
                  <Edit />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除${announcement.title}`}
                  title="删除"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(announcement)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]}
        rows={announcements}
        getRowKey={(announcement) => announcement.id}
        isLoading={loading}
        empty={
          <EmptyState
            icon={Megaphone}
            title="暂无公告"
            description="点击上方按钮发布第一条公告"
            className="bg-card"
          />
        }
      />

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        {/* `sm:` rather than a bare `max-w-lg`: the kit's popup already carries
            `sm:max-w-sm`, which wins over an unprefixed width from 640px up. */}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑公告' : '发布新公告'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="公告标题">
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="请输入公告标题"
                required
              />
            </FormField>
            <FormField label="公告内容">
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="resize-none"
                rows={4}
                placeholder="请输入公告内容"
                required
              />
            </FormField>
            {/* `inline`, because this label belongs to the tick box beside it. The copy
                is the checkbox's own label verbatim, so `getByLabelText` still reaches
                the control (FormField wraps it in a `<label>`). */}
            <FormField label="设为当前活动公告（将替换当前的活动公告）" inline>
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal}>
                取消
              </Button>
              <Button type="submit">{editingId ? '保存更改' : '发布'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="确认删除公告"
        // The sentence the old `confirm()` showed, kept word for word.
        description="确定要删除这条公告吗？"
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
