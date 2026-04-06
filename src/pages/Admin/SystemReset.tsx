import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';

import { apiGet } from "@/lib/api";

export default function SystemReset() {
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const logout = useStore(state => state.logout);
  const navigate = useNavigate();

  const handleReset = async () => {
    if (confirmText !== 'CONFIRM') {
      toast.error('请输入大写的 CONFIRM 以确认操作');
      return;
    }

    if (!confirm('您确定要重置数据库吗？此操作不可逆！')) return;

    setResetting(true);
    try {
      const data = await apiGet('/api/admin/system/reset-database');

      if (data.success) {
        toast.success(data.message || '数据库已成功重置，服务器即将重启');
        logout();
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        toast.error(data.message || '重置失败');
        setResetting(false);
      }
    } catch (_error) {
      toast.error('网络错误，重置失败');
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-red-700">高危操作：系统重置</h2>
            <p className="text-red-600/80 mt-1">此操作将清空除超级管理员外的所有数据！</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-red-100 space-y-4">
          <h3 className="font-semibold text-slate-800">重置操作将执行以下步骤：</h3>
          <ul className="list-disc pl-5 space-y-2 text-slate-600 text-sm">
            <li><strong className="text-red-600">删除</strong>所有学生、教师、家长账户。</li>
            <li><strong className="text-red-600">清空</strong>所有班级、作业、考试记录。</li>
            <li><strong className="text-red-600">清空</strong>所有游戏化数据（宠物、金币、大乱斗等）。</li>
            <li><strong className="text-emerald-600">保留</strong>当前的超级管理员账户。</li>
            <li>重置后服务器将自动重启。</li>
          </ul>

          <div className="pt-6 mt-6 border-t border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              为确认您的操作，请在下方输入大写的 <span className="font-mono text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">CONFIRM</span>
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="输入 CONFIRM"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all mb-4"
            />

            <button
              onClick={handleReset}
              disabled={resetting || confirmText !== 'CONFIRM'}
              className="w-full flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  正在执行重置...
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5 mr-2" />
                  确认并立即重置系统
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
