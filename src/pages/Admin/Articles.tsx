import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';

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

export default function AdminArticles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
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
      const res = await fetch('/api/website/articles');
      const data = await res.json();
      if (data.success) {
        setArticles(data.articles);
      } else {
        toast.error(data.message || '获取文章失败');
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
      const url = editingId 
        ? `/api/website/articles/${editingId}` 
        : '/api/website/articles';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          is_published: formData.is_published ? 1 : 0
        })
      });
      
      const data = await res.json();
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

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这篇文章吗？')) return;

    try {
      const res = await fetch(`/api/website/articles/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('文章已删除');
        fetchArticles();
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (error) {
      toast.error('网络错误，删除失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">文章管理</h2>
          <p className="text-slate-500 mt-1">管理前台网站展示的文章内容</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
        >
          <Plus className="w-4 h-4 mr-2" />
          发布新文章
        </button>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-1">暂无文章</h3>
            <p className="text-slate-500">点击上方按钮发布第一篇文章</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                  <th className="px-6 py-4 font-medium">标题</th>
                  <th className="px-6 py-4 font-medium">分类</th>
                  <th className="px-6 py-4 font-medium">状态</th>
                  <th className="px-6 py-4 font-medium">阅读量</th>
                  <th className="px-6 py-4 font-medium">创建时间</th>
                  <th className="px-6 py-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((article) => (
                  <tr key={article.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-800 font-medium">
                      {article.title}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs">{article.category || '未分类'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${article.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {article.is_published ? '已发布' : '草稿'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {article.view_count || 0}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {new Date(article.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleOpenModal(article)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(article.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? '编辑文章' : '发布新文章'}
              </h3>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  文章标题
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="请输入文章标题"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    文章分类
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                  >
                    <option value="新闻">新闻</option>
                    <option value="公告">公告</option>
                    <option value="活动">活动</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    封面图 URL
                  </label>
                  <input
                    type="text"
                    value={formData.cover_image}
                    onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  文章摘要 (选填)
                </label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                  rows={2}
                  placeholder="简短的介绍，将展示在首页..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  文章内容
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  rows={8}
                  placeholder="请输入文章内容支持较长文本..."
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  id="is_published"
                  type="checkbox"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_published" className="ml-2 block text-sm text-slate-700">
                  立即发布 (在前台显示)
                </label>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-slate-600 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                >
                  {editingId ? '保存更改' : '发布'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
