import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Megaphone } from 'lucide-react';

import { apiGet, apiDelete } from "@/lib/api";

interface Announcement {
  id: number;
  title: string;
  content: string;
  created_at: string;
  is_active: number;
}

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_active: false
  });

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/admin/announcements');
      if (data.success) {
        setAnnouncements(data.announcements);
      } else {
        toast.error(data.message || '获取公告失败');
      }
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
      const url = editingId 
        ? `/api/admin/announcements/${editingId}` 
        : '/api/admin/announcements';
      const method = editingId ? 'PUT' : 'POST';

      const data = await apiGet(url);
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

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条公告吗？')) return;

    try {
      const data = await apiDelete(`/api/admin/announcements/${id}`);

      if (data.success) {
        toast.success('公告已删除');
        fetchAnnouncements();
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
          <h2 className="text-2xl font-bold text-slate-800">公告管理</h2>
          <p className="text-slate-500 mt-1">管理系统中展示给所有用户的全局公告</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
        >
          <Plus className="w-4 h-4 mr-2" />
          发布新公告
        </button>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Megaphone className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-1">暂无公告</h3>
            <p className="text-slate-500">点击上方按钮发布第一条公告</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                  <th className="px-6 py-4 font-medium">标题</th>
                  <th className="px-6 py-4 font-medium">内容摘要</th>
                  <th className="px-6 py-4 font-medium">状态</th>
                  <th className="px-6 py-4 font-medium">创建时间</th>
                  <th className="px-6 py-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {announcements.map((announcement) => (
                  <tr key={announcement.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-800 font-medium">
                      {announcement.title}
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                      {announcement.content}
                    </td>
                    <td className="px-6 py-4">
                      {announcement.is_active === 1 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          活动中
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          未激活
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {new Date(announcement.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleOpenModal(announcement)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(announcement.id)}
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
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? '编辑公告' : '发布新公告'}
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
                  公告标题
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="请输入公告标题"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  公告内容
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  rows={4}
                  placeholder="请输入公告内容"
                  required
                />
              </div>
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-slate-700">
                  设为当前活动公告（将替换当前的活动公告）
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