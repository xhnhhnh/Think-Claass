import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Users } from 'lucide-react';

interface Teacher {
  id: number;
  username: string;
  role: string;
}

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) {
        setTeachers(data.users);
      } else {
        toast.error(data.message || '获取教师列表失败');
      }
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
      setFormData({
        username: teacher.username,
        password: '' // 不显示原密码
      });
    } else {
      setEditingId(null);
      setFormData({
        username: '',
        password: ''
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
    if (!formData.username.trim()) {
      toast.error('用户名不能为空');
      return;
    }
    if (!editingId && !formData.password) {
      toast.error('密码不能为空');
      return;
    }

    try {
      const url = editingId 
        ? `/api/admin/users/${editingId}` 
        : '/api/admin/users';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password || undefined // 只有在填写时才发送
        })
      });
      
      const data = await res.json();
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

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这位教师吗？所有相关的班级、学生和记录将被永久删除！')) return;

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('教师已删除');
        fetchTeachers();
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
          <h2 className="text-2xl font-bold text-slate-800">教师管理</h2>
          <p className="text-slate-500 mt-1">管理系统中的所有教师账号</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加教师
        </button>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-1">暂无教师</h3>
            <p className="text-slate-500">点击上方按钮添加第一位教师</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                  <th className="px-6 py-4 font-medium">ID</th>
                  <th className="px-6 py-4 font-medium">用户名</th>
                  <th className="px-6 py-4 font-medium">角色</th>
                  <th className="px-6 py-4 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-800">
                      {teacher.id}
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-medium">
                      {teacher.username}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {teacher.role === 'teacher' ? '教师' : teacher.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleOpenModal(teacher)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(teacher.id)}
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
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? '编辑教师' : '添加教师'}
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
                  用户名
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="请输入用户名"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {editingId ? '新密码 (留空表示不修改)' : '密码'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder={editingId ? '输入新密码' : '请输入密码'}
                  required={!editingId}
                />
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
                  className="px-4 py-2 text-white bg-blue-600 rounded-2xl hover:bg-blue-700 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                >
                  {editingId ? '保存更改' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
