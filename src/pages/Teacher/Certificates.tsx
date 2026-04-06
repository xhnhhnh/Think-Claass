import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Award, Search, Plus, User, Calendar, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

import { apiGet, apiPost } from "@/lib/api";

interface Student {
  id: number;
  name: string;
  total_points: number;
}

interface Certificate {
  id: number;
  student_id: number;
  student_name: string;
  title: string;
  description: string;
  created_at: string;
}

export default function TeacherCertificates() {
  const user = useStore((state) => state.user);
  const [students, setStudents] = useState<Student[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [selectedStudent, setSelectedStudent] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsData, certsData] = await Promise.all([
          apiGet('/api/students'),
          apiGet('/api/certificates')
        ]);

      if (studentsData.success) {
        setStudents(studentsData.students);
      }
      if (certsData.success) {
        setCertificates(certsData.certificates);
      }
    } catch (error) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !title.trim()) {
      toast.error('请选择学生并填写荣誉称号');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiPost('/api/certificates', {
        student_id: selectedStudent,
        title: title.trim(),
        description: description.trim()
      });

      if (data.success) {
        toast.success('奖状颁发成功！');
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        setIsModalOpen(false);
        setSelectedStudent('');
        setTitle('');
        setDescription('');
        fetchData(); // Refresh list
      } else {
        toast.error(data.message || '颁发失败');
      }
    } catch (error) {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCerts = certificates.filter(cert => 
    cert.student_name.includes(searchTerm) || cert.title.includes(searchTerm)
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-indigo-100/50 rounded-2xl flex items-center justify-center mr-4">
            <Award className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">荣誉奖状</h1>
            <p className="text-sm text-slate-500 mt-1">为表现优异的学生颁发专属荣誉</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white px-6 py-2.5 rounded-xl font-medium shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all flex items-center w-full sm:w-auto justify-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          颁发新奖状
        </button>
      </div>

      {/* Search & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white/80 backdrop-blur-xl p-2 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center">
          <Search className="w-5 h-5 text-slate-400 ml-3" />
          <input
            type="text"
            placeholder="搜索学生姓名或荣誉称号..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none focus:ring-0 text-slate-700 px-4"
          />
        </div>
        <div className="bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center justify-between">
          <span className="text-slate-500 font-medium">累计颁发</span>
          <span className="text-2xl font-bold text-indigo-600">{certificates.length}</span>
        </div>
      </div>

      {/* Certificates List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-400">加载中...</div>
        ) : filteredCerts.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white/50 backdrop-blur-xl rounded-2xl border border-white/60 border-dashed">
            <Award className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">暂无颁发记录</p>
          </div>
        ) : (
          filteredCerts.map((cert) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={cert.id}
              className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden group hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all"
            >
              <div className="bg-gradient-to-br from-amber-100 to-orange-50 p-6 text-center border-b border-amber-200/50 relative">
                <div className="absolute top-4 right-4 opacity-20">
                  <Award className="w-16 h-16 text-amber-600" />
                </div>
                <h3 className="text-xl font-black text-amber-800 mb-1 relative z-10">{cert.title}</h3>
                <p className="text-amber-600/80 text-sm font-medium relative z-10">授予：{cert.student_name}</p>
              </div>
              <div className="p-6">
                <p className="text-slate-600 text-sm mb-4 leading-relaxed line-clamp-3">
                  {cert.description || '表现优异，特发此状，以资鼓励。'}
                </p>
                <div className="flex items-center text-xs text-slate-400">
                  <Calendar className="w-4 h-4 mr-1.5" />
                  {new Date(cert.created_at).toLocaleDateString()}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Issue Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center">
                  <Award className="w-5 h-5 mr-2 text-indigo-500" />
                  颁发荣誉奖状
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
              </div>
              
              <form onSubmit={handleIssueCertificate} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">选择学生 <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={selectedStudent}
                      onChange={(e) => setSelectedStudent(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none"
                      required
                    >
                      <option value="">请选择要表彰的学生</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">荣誉称号 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="如：阅读之星、进步标兵"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">表彰寄语</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="写几句鼓励的话语...（选填）"
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                  />
                </div>

                <div className="pt-4 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex justify-center items-center"
                  >
                    {submitting ? '颁发中...' : (
                      <>
                        <CheckCircle className="w-5 h-5 mr-1.5" /> 确认颁发
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}