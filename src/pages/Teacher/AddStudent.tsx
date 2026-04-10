import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, ArrowLeft, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { apiGet, apiPost } from "@/lib/api";

export default function AddStudent() {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultClassId = location.state?.classId || '';
  
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [newStudent, setNewStudent] = useState({ name: '', username: '', class_id: defaultClassId });
  const [batchData, setBatchData] = useState('');
  const [batchClassId, setBatchClassId] = useState(defaultClassId);
  const [classes, setClasses] = useState<{id: number, name: string}[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const data = await apiGet('/api/classes');
        if (data.success) {
          setClasses(data.classes);
          if (data.classes.length > 0 && !defaultClassId) {
            setNewStudent(prev => ({ ...prev, class_id: data.classes[0].id }));
            setBatchClassId(data.classes[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch classes:', err);
      }
    };
    fetchClasses();
  }, [defaultClassId]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const data = await apiPost('/api/students', newStudent);

      if (data.success) {
        toast.success('学生添加成功');
        navigate('/teacher', { state: { classId: newStudent.class_id } }); // Redirect to dashboard and keep class selected
      } else {
        setError(data.message || '创建失败');
        toast.error(data.message || '创建失败');
      }
    } catch (err) {
      setError('网络错误');
      toast.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  const handleBatchImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchData.trim()) {
      setError('请输入学生数据');
      return;
    }

    setCreating(true);
    setError('');

    // Parse batch data: expected format is "name,username" per line
    const lines = batchData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const students = lines.map(line => {
      // support comma, tab, or space separation
      const parts = line.split(/[, \t]+/);
      return {
        name: parts[0] || '',
        username: parts[1] || ''
      };
    }).filter(s => s.name && s.username);

    if (students.length === 0) {
      setError('未识别到有效的学生数据，请检查格式');
      toast.error('未识别到有效的学生数据，请检查格式');
      setCreating(false);
      return;
    }

    try {
      const data = await apiPost('/api/students/batch-import', { students, class_id: batchClassId });

      if (data.success) {
        toast.success(`成功导入 ${students.length} 名学生`);
        navigate('/teacher', { state: { classId: batchClassId } });
      } else {
        setError(data.message || '导入失败');
        toast.error(data.message || '导入失败');
      }
    } catch (err) {
      setError('网络错误');
      toast.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4 bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <button
          onClick={() => navigate('/teacher', { state: { classId: defaultClassId } })}
          className="p-2 text-gray-400 hover:text-slate-600 hover:bg-slate-50/50 rounded-xl transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">添加学生</h1>
          <p className="text-sm text-slate-500">为班级添加新的学生账号</p>
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 overflow-hidden">
        <div className="flex border-b border-white/60">
          <button
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'single' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/50/30' : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab('single')}
          >
            单个添加
          </button>
          <button
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'batch' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/50/30' : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab('batch')}
          >
            批量导入
          </button>
        </div>

        {activeTab === 'single' ? (
          <form onSubmit={handleCreateStudent} className="p-8 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 flex items-center">
                {error}
              </div>
            )}
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  所属班级 <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={newStudent.class_id}
                  onChange={(e) => setNewStudent({ ...newStudent, class_id: parseInt(e.target.value) })}
                  className="block w-full border-gray-300 rounded-xl py-3 px-4 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50/50 focus:bg-white/80 backdrop-blur-xl transition-colors"
                >
                  <option value="" disabled>请选择班级</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  学生姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  className="block w-full border-gray-300 rounded-xl py-3 px-4 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50/50 focus:bg-white/80 backdrop-blur-xl transition-colors"
                  placeholder="例如: 张三"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  登录账号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newStudent.username}
                  onChange={(e) => setNewStudent({ ...newStudent, username: e.target.value })}
                  className="block w-full border-gray-300 rounded-xl py-3 px-4 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50/50 focus:bg-white/80 backdrop-blur-xl transition-colors"
                  placeholder="建议使用学号或拼音缩写"
                />
                <div className="mt-2 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-sm text-blue-700 flex items-center">
                    <span className="font-semibold mr-1">提示:</span> 
                    新创建的学生账号默认登录密码为 
                    <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded text-blue-800 font-mono">123456</code>
                  </p>
                </div>
              </div>
            </div>
            
            <div className="pt-6 border-t border-white/60 flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/teacher', { state: { classId: defaultClassId } })}
                className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center px-6 py-2.5 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {creating ? '创建中...' : '确认添加'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBatchImport} className="p-8 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 flex items-center">
                {error}
              </div>
            )}
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  导入至班级 <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={batchClassId}
                  onChange={(e) => setBatchClassId(parseInt(e.target.value))}
                  className="block w-full border-gray-300 rounded-xl py-3 px-4 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50/50 focus:bg-white/80 backdrop-blur-xl transition-colors"
                >
                  <option value="" disabled>请选择班级</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  粘贴学生数据 <span className="text-red-500">*</span>
                </label>
                <div className="mb-2 text-sm text-slate-500">
                  请按照 <strong>姓名 账号</strong> 的格式输入，每行一个学生。支持使用空格、制表符（Tab）或逗号分隔。
                </div>
                <textarea
                  required
                  value={batchData}
                  onChange={(e) => setBatchData(e.target.value)}
                  rows={8}
                  className="block w-full border-gray-300 rounded-xl py-3 px-4 border focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-slate-50/50 focus:bg-white/80 backdrop-blur-xl transition-colors font-mono"
                  placeholder="张三 zhangsan&#10;李四 lisi&#10;王五,wangwu"
                />
                <div className="mt-2 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-sm text-blue-700">
                    <span className="font-semibold mr-1">提示:</span> 
                    您可以直接从 Excel 表格中复制两列（姓名列、账号列），然后粘贴到上方输入框中。默认密码均为 123456。
                  </p>
                </div>
              </div>
            </div>
            
            <div className="pt-6 border-t border-white/60 flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/teacher', { state: { classId: defaultClassId } })}
                className="px-6 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-slate-700 bg-white/80 backdrop-blur-xl hover:bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating || !batchData.trim()}
                className="flex items-center px-6 py-2.5 border border-transparent rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                {creating ? '导入中...' : '确认导入'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
