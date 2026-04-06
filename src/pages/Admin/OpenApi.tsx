import { useState, useEffect } from 'react';
import { Key, Building2, Plus, Trash2, Copy, CheckCircle, Search, Server } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { apiGet, apiPost, apiDelete } from "@/lib/api";

interface ApiKey {
  id: number;
  name: string;
  api_key: string;
  created_at: string;
}

interface School {
  id: number;
  name: string;
  description: string;
  contact_info: string;
  created_at: string;
}

export default function AdminOpenApi() {
  const [activeTab, setActiveTab] = useState<'API_KEYS' | 'SCHOOLS'>('API_KEYS');
  
  // Data state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state
  const [keyName, setKeyName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolDesc, setSchoolDesc] = useState('');
  const [schoolContact, setSchoolContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'API_KEYS') {
        const data = await apiGet('/api/openapi/keys');
        if (data.success) setApiKeys(data.keys);
      } else {
        const data = await apiGet('/api/openapi/schools');
        if (data.success) setSchools(data.schools);
      }
    } catch (error) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setSubmitting(true);
    try {
      const data = await apiPost('/api/openapi/keys', { name: keyName.trim() });
      if (data.success) {
        toast.success('API 密钥生成成功');
        setIsKeyModalOpen(false);
        setKeyName('');
        fetchData();
      } else {
        toast.error(data.message || '生成失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (id: number) => {
    if (!confirm('确定要删除该 API 密钥吗？删除后相关接口调用将失效！')) return;
    try {
      const data = await apiDelete(`/api/openapi/keys/${id}`);
      if (data.success) {
        toast.success('密钥已删除');
        fetchData();
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;

    setSubmitting(true);
    try {
      const data = await apiPost('/api/openapi/schools', { 
        name: schoolName.trim(),
        description: schoolDesc.trim(),
        contact_info: schoolContact.trim()
      });

      if (data.success) {
        toast.success('入驻学校添加成功');
        setIsSchoolModalOpen(false);
        setSchoolName('');
        setSchoolDesc('');
        setSchoolContact('');
        fetchData();
      } else {
        toast.error(data.message || '添加失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSchool = async (id: number) => {
    if (!confirm('确定要删除该学校信息吗？')) return;
    try {
      const data = await apiDelete(`/api/openapi/schools/${id}`);
      if (data.success) {
        toast.success('学校信息已删除');
        fetchData();
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Tabs */}
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-indigo-100/50 rounded-2xl flex items-center justify-center mr-4">
            <Server className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">开发者与校园</h1>
            <p className="text-sm text-slate-500 mt-1">管理系统开放 API 密钥与合作入驻的校园信息</p>
          </div>
        </div>
        
        <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/50 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('API_KEYS')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'API_KEYS'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <div className="flex items-center justify-center">
              <Key className="w-4 h-4 mr-2" />
              API 密钥
            </div>
          </button>
          <button
            onClick={() => setActiveTab('SCHOOLS')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'SCHOOLS'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <div className="flex items-center justify-center">
              <Building2 className="w-4 h-4 mr-2" />
              合作校园
            </div>
          </button>
        </div>
      </div>
      {/* Main Content */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 overflow-hidden">
        
        {/* Content Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <h2 className="text-lg font-bold text-slate-800">
            {activeTab === 'API_KEYS' ? '密钥列表' : '校园列表'}
          </h2>
          <button
            onClick={() => activeTab === 'API_KEYS' ? setIsKeyModalOpen(true) : setIsSchoolModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {activeTab === 'API_KEYS' ? '生成新密钥' : '添加校园'}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-0">
          {loading ? (
            <div className="py-20 text-center text-slate-400">加载中...</div>
          ) : activeTab === 'API_KEYS' ? (
            /* API Keys Table */
            (<div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm">
                    <th className="px-6 py-4 font-medium border-b border-slate-100">应用名称</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100">API 密钥 (sk_...)</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100">生成时间</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">暂无生成的 API 密钥</td>
                    </tr>
                  ) : (
                    apiKeys.map((key) => (
                      <tr key={key.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 font-medium text-slate-800">{key.name}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <code className="bg-slate-100 text-slate-700 px-3 py-1 rounded text-sm font-mono border border-slate-200">
                              {key.api_key.substring(0, 10)}...{key.api_key.substring(key.api_key.length - 4)}
                            </code>
                            <button
                              onClick={() => copyToClipboard(key.api_key)}
                              className="ml-3 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="复制完整密钥"
                            >
                              {copiedKey === key.api_key ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-sm">
                          {new Date(key.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteKey(key.id)}
                            className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>)
          ) : (
            /* Schools Table */
            (<div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm">
                    <th className="px-6 py-4 font-medium border-b border-slate-100">学校名称</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100">简介</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100">联系方式</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100">入驻时间</th>
                    <th className="px-6 py-4 font-medium border-b border-slate-100 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schools.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">暂无入驻的合作校园</td>
                    </tr>
                  ) : (
                    schools.map((school) => (
                      <tr key={school.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 font-bold text-slate-800 flex items-center">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3 text-xs font-black">
                            {school.name.substring(0, 1)}
                          </div>
                          {school.name}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm max-w-xs truncate" title={school.description}>
                          {school.description || '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          {school.contact_info || '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-sm">
                          {new Date(school.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteSchool(school.id)}
                            className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>)
          )}
        </div>
      </div>
      {/* Modals */}
      <AnimatePresence>
        {isKeyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsKeyModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-lg font-bold text-slate-800">生成新 API 密钥</h2>
                <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
              </div>
              <form onSubmit={handleCreateKey} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">应用名称标识</label>
                  <input type="text" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="例如：外部教务系统对接" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" required />
                </div>
                <div className="pt-2 flex space-x-3">
                  <button type="button" onClick={() => setIsKeyModalOpen(false)} className="flex-1 py-2.5 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50">确认生成</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isSchoolModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSchoolModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="text-lg font-bold text-slate-800">添加合作校园</h2>
                <button onClick={() => setIsSchoolModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
              </div>
              <form onSubmit={handleCreateSchool} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">学校名称 <span className="text-red-500">*</span></label>
                  <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="例如：第一实验小学" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">学校简介</label>
                  <textarea value={schoolDesc} onChange={(e) => setSchoolDesc(e.target.value)} placeholder="选填..." rows={2} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">联系方式</label>
                  <input type="text" value={schoolContact} onChange={(e) => setSchoolContact(e.target.value)} placeholder="负责人姓名/电话等（选填）" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div className="pt-2 flex space-x-3">
                  <button type="button" onClick={() => setIsSchoolModalOpen(false)} className="flex-1 py-2.5 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50">确认添加</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}