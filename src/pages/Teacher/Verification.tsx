import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle, Search, Gift, User, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { useRedemptionVerifyMutation } from '@/hooks/queries/useRedemption';

export default function TeacherVerification() {
  const user = useStore((state) => state.user);
  const [code, setCode] = useState('');
  const verifyMutation = useRedemptionVerifyMutation();
  const loading = verifyMutation.isPending;
  const [result, setResult] = useState<any>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error('请输入核销码');
      return;
    }

    try {
      const data = await verifyMutation.mutateAsync({ code: code.trim().toUpperCase(), teacherId: user?.id });
      toast.success('核销成功！');
      setResult(data.ticket);
      setCode('');
    } catch (err) {
      console.error('Verify error:', err);
      toast.error('网络错误');
      setResult(null);
    }
  };



  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center mb-8">
          <div className="p-3 bg-indigo-100/50 rounded-xl mr-4">
            <CheckCircle className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">奖品核销</h2>
            <p className="text-slate-500 mt-1">输入学生提供的核销码进行奖品兑换核销</p>
          </div>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">核销码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例如: RED-123456789"
                className="block w-full pl-11 pr-4 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:ring-indigo-500 focus:border-indigo-500 font-mono tracking-wider placeholder-gray-300"
                autoFocus
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] text-lg font-bold text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '核销中...' : '确认核销'}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-indigo-50/50 border-2 border-indigo-200/50 p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full p-2 mr-3">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-indigo-800">核销成功</h3>
          </div>
          
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 space-y-4 border border-green-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="flex items-center">
              <Gift className="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <div className="text-sm text-slate-500">兑换商品</div>
                <div className="font-bold text-slate-800 text-lg">{result.item_name}</div>
              </div>
            </div>
            
            <div className="flex items-center">
              <User className="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <div className="text-sm text-slate-500">兑换学生</div>
                <div className="font-bold text-slate-800">{result.student_name}</div>
              </div>
            </div>

            <div className="flex items-center">
              <Clock className="w-5 h-5 text-gray-400 mr-3" />
              <div>
                <div className="text-sm text-slate-500">兑换时间</div>
                <div className="font-bold text-slate-800">{new Date(result.created_at).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
