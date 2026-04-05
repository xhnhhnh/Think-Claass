import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Key, Plus, Download, Copy, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminCodes() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/codes');
      const data = await res.json();
      if (data.success) {
        setCodes(data.codes);
      } else {
        toast.error(data.message || '获取激活码失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const handleGenerate = async () => {
    if (generateCount < 1 || generateCount > 1000) {
      toast.error('生成数量必须在 1 到 1000 之间');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: generateCount })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchCodes();
      } else {
        toast.error(data.message || '生成失败');
      }
    } catch (error) {
      toast.error('网络错误');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('已复制到剪贴板');
    });
  };

  const downloadCSV = () => {
    if (codes.length === 0) {
      toast.error('没有激活码可导出');
      return;
    }
    
    const headers = ['激活码', '状态', '使用人', '生成时间', '使用时间'];
    const rows = codes.map(c => [
      c.code,
      c.status === 'used' ? '已使用' : '未使用',
      c.used_by_username || '',
      new Date(c.created_at).toLocaleString(),
      c.used_at ? new Date(c.used_at).toLocaleString() : ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activation_codes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">激活码管理</h2>
          <p className="text-slate-500 mt-1">生成和管理系统访问激活码</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={downloadCSV}
            className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            导出 CSV
          </button>
          
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <input 
              type="number" 
              min="1" 
              max="1000" 
              value={generateCount}
              onChange={(e) => setGenerateCount(Number(e.target.value))}
              className="w-16 px-2 py-1 text-center outline-none text-slate-700 bg-transparent"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              {generating ? '生成中...' : '生成'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-sm border-b border-slate-100">
                <th className="p-4 font-medium">激活码</th>
                <th className="p-4 font-medium">状态</th>
                <th className="p-4 font-medium">使用者</th>
                <th className="p-4 font-medium">生成时间</th>
                <th className="p-4 font-medium">使用时间</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 flex flex-col items-center">
                    <Key className="w-8 h-8 mb-2 opacity-20" />
                    暂无激活码记录
                  </td>
                </tr>
              ) : (
                codes.map((code) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={code.id} 
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-medium text-slate-700 bg-slate-100 px-2 py-1 rounded">
                          {code.code}
                        </span>
                        <button 
                          onClick={() => copyToClipboard(code.code, code.id)}
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                          title="复制"
                        >
                          {copiedId === code.id ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        code.status === 'used' 
                          ? 'bg-slate-100 text-slate-500' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {code.status === 'used' ? '已使用' : '未使用'}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">
                      {code.used_by_username || '-'}
                    </td>
                    <td className="p-4 text-slate-500">
                      {new Date(code.created_at).toLocaleString()}
                    </td>
                    <td className="p-4 text-slate-500">
                      {code.used_at ? new Date(code.used_at).toLocaleString() : '-'}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}