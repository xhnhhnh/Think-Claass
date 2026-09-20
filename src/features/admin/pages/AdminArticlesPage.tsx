import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Edit, FileText, Plus, Trash2 } from 'lucide-react';

import { portalApi } from '@/features/portal/api/portalApi';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Article {
  id: number;
  title: string;
  summary: string;
  content: string;
  cover_image: string;
  category: string;
  is_published: number;
  view_count: number;
  created_at: string;
}

/**
 * 文章管理.
 *
 * `AdminTeachersPage`'s shape again: `PageHeader` + `DataTable` (loading and empty live
 * in the table) + `Dialog` for the form + `ConfirmDialog` for the delete. The page used
 * to write its own `<table>` (six `<th>`, a hand-styled chip per row), its own spinner,
 * its own "暂无文章" block, a fixed-overlay modal and a blocking `confirm()`.
 *
 * The category `<select>` stays a native select through the kit's `Select`, which is a
 * styled native element on purpose - the form's contract does not change.
 */
export default function AdminArticles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The delete target and its in-flight flag, replacing the inline `confirm()`.
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    content: '',
    cover_image: '',
    category: '新闻',
    is_published: false
  });

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const data = await portalApi.getArticles();
      if (data.success) {
        setArticles(data.articles);
      } else {
        toast.error('获取文章失败');
      }
    } catch (error) {
      toast.error('网络错误，无法获取文章数据');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleOpenModal = (article?: Article) => {
    if (article) {
      setEditingId(article.id);
      setFormData({
        title: article.title || '',
        summary: article.summary || '',
        content: article.content || '',
        cover_image: article.cover_image || '',
        category: article.category || '新闻',
        is_published: article.is_published === 1
      });
    } else {
      setEditingId(null);
      setFormData({
        title: '',
        summary: '',
        content: '',
        cover_image: '',
        category: '新闻',
        is_published: true
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
      const payload = {
        title: formData.title.trim(),
        summary: formData.summary,
        content: formData.content.trim(),
        cover_image: formData.cover_image,
        category: formData.category,
        is_published: formData.is_published,
      };
      const data = editingId ? await portalApi.updateArticle(editingId, payload) : await portalApi.createArticle(payload);
      if (data.success) {
        toast.success(editingId ? '文章更新成功' : '文章创建成功');
        handleCloseModal();
        fetchArticles();
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
      const data = await portalApi.deleteArticle(deleteTarget.id);

      if (data.success) {
        toast.success('文章已删除');
        // Closed on success only: a failed delete leaves the dialog up for a retry,
        // which is where the old `confirm()` flow left the user too.
        setDeleteTarget(null);
        fetchArticles();
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
        title="文章管理"
        description="管理前台网站展示的文章内容"
        icon={FileText}
        actions={
          <Button onClick={() => handleOpenModal()}>
            <Plus data-icon="inline-start" />
            发布新文章
          </Button>
        }
      />

      <DataTable<Article>
        columns={[
          { key: 'title', header: '标题', className: 'font-medium text-ink-1' },
          {
            key: 'category',
            header: '分类',
            // The API's category is free text, so the fallback chip stays.
            render: (article) => <Badge variant="secondary">{article.category || '未分类'}</Badge>,
          },
          {
            key: 'is_published',
            header: '状态',
            // The green/amber pair the page drew by hand are the `success` and `warning`
            // badges; `is_published` is the API's 1/0 flag.
            render: (article) => (
              <Badge variant={article.is_published ? 'success' : 'warning'}>
                {article.is_published ? '已发布' : '草稿'}
              </Badge>
            ),
          },
          {
            key: 'view_count',
            header: '阅读量',
            className: 'text-ink-2',
            render: (article) => article.view_count || 0,
          },
          {
            key: 'created_at',
            header: '创建时间',
            className: 'text-ink-3',
            render: (article) => new Date(article.created_at).toLocaleString(),
          },
          {
            key: 'actions',
            header: <span className="sr-only">操作</span>,
            align: 'right',
            render: (article) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`编辑${article.title}`}
                  title="编辑"
                  onClick={() => handleOpenModal(article)}
                >
                  <Edit />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除${article.title}`}
                  title="删除"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteTarget(article)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]}
        rows={articles}
        getRowKey={(article) => article.id}
        isLoading={loading}
        empty={
          <EmptyState
            icon={FileText}
            title="暂无文章"
            description="点击上方按钮发布第一篇文章"
            className="bg-card"
          />
        }
      />

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        {/* `sm:` rather than a bare `max-w-2xl`: the kit's popup carries `sm:max-w-sm`,
            which would otherwise win from 640px up and crush the two-column row. */}
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑文章' : '发布新文章'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="文章标题">
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="请输入文章标题"
                required
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="文章分类">
                <Select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="新闻">新闻</option>
                  <option value="公告">公告</option>
                  <option value="活动">活动</option>
                  <option value="其他">其他</option>
                </Select>
              </FormField>
              <FormField label="封面图 URL">
                <Input
                  type="text"
                  value={formData.cover_image}
                  onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                  placeholder="https://..."
                />
              </FormField>
            </div>

            <FormField label="文章摘要 (选填)">
              <Textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                className="resize-none"
                rows={2}
                placeholder="简短的介绍，将展示在首页..."
              />
            </FormField>

            <FormField label="文章内容">
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="resize-none"
                rows={8}
                placeholder="请输入文章内容支持较长文本..."
                required
              />
            </FormField>

            {/* `inline`, because this label belongs to the tick box beside it; the copy is
                the checkbox's own label verbatim, so `getByLabelText` still reaches it. */}
            <FormField label="立即发布 (在前台显示)" inline>
              <Checkbox
                id="is_published"
                checked={formData.is_published}
                onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
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
        title="确认删除文章"
        // The sentence the old `confirm()` showed, kept word for word.
        description="确定要删除这篇文章吗？"
        confirmLabel="删除"
        pendingLabel="删除中..."
        destructive
        isPending={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
