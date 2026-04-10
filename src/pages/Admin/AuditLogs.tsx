import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Shield, Search, RefreshCw, Calendar, User, Tag } from 'lucide-react';

import { apiGet } from "@/lib/api";

interface AuditLog {
  id: number;
  teacher_id: number;
  user_id: number;
  action: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [teacherId, setTeacherId] = useState('');
  const [userId, setUserId] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString()
      });

      if (teacherId) queryParams.append('teacher_id', teacherId);
      if (userId) queryParams.append('user_id', userId);
      if (actionFilter) queryParams.append('action', actionFilter);

      const data = await apiGet(`/api/audit-logs?${queryParams.toString()}`);
      if (data.success) {
        setLogs(data.data);
        setTotal(data.total);
      } else {
        toast.error(data.message || '获取审计日志失败');
      }
    } catch (error) {
      toast.error('网络错误，无法获取审计日志');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleReset = () => {
    setTeacherId('');
    setUserId('');
    setActionFilter('');
    setPage(1);
    setTimeout(fetchLogs, 0);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-500" />
            系统审计日志
          </h2>
          <p className="text-slate-500 mt-1">查看系统的所有关键操作记录，用于安全审计和追踪溯源</p>
        </div>
        <button 
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新数据
        </button>
      </div>

      <div className="bg-white/80 backdrop-blur-xl p-4 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">教师 ID</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                placeholder="输入教师 ID"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">用户 ID</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="输入用户 ID"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">操作类型 (Action)</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="例如: LOGIN, UPDATE_USER"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-colors flex items-center"
            >
              <Search className="w-4 h-4 mr-2" />
              查询
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-2 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors"
            >
              重置
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">ID</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">时间</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">操作类型</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">操作人</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">目标用户</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">详情</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">IP 地址</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                      加载中...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    没有找到符合条件的审计日志
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-500">#{log.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap flex items-center">
                      <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {log.teacher_id ? `Teacher ID: ${log.teacher_id}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {log.user_id ? `User ID: ${log.user_id}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 max-w-md truncate" title={log.details}>
                      {log.details || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400 font-mono text-xs">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="text-sm text-slate-500">
              共 <span className="font-medium text-slate-800">{total}</span> 条记录，
              第 <span className="font-medium text-slate-800">{page}</span> / {totalPages} 页
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}