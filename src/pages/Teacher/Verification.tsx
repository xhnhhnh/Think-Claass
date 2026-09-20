import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle, Search, Gift, User, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
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
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="rounded-panel border border-border bg-paper/80 p-8 shadow-card backdrop-blur-xl">
        <PageHeader
          title="奖品核销"
          description="输入学生提供的核销码进行奖品兑换核销"
          icon={CheckCircle}
          className="mb-8"
        />

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-2">核销码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-ink-3" />
              </div>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例如: RED-123456789"
                className="block w-full pl-11 pr-4 py-4 text-lg border-2 border-border rounded-card focus:ring-ring focus:border-ring font-mono tracking-wider placeholder-gray-300"
                autoFocus
              />
            </div>
          </div>
          
          <Button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-card shadow-card text-lg font-bold text-white bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '核销中...' : '确认核销'}
          </Button>
        </form>
      </div>

      {result && (
        <div className="bg-primary/5 border-2 border-primary/20 p-8 rounded-3xl shadow-card animate-slide-in-bottom">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-primary to-cyan-500 rounded-full p-2 mr-3">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-primary">核销成功</h3>
          </div>
          
          <div className="bg-paper/80 backdrop-blur-xl rounded-card p-6 space-y-4 border border-success/20 shadow-card">
            <div className="flex items-center">
              <Gift className="w-5 h-5 text-ink-3 mr-3" />
              <div>
                <div className="text-sm text-ink-3">兑换商品</div>
                <div className="font-bold text-ink-1 text-lg">{result.item_name}</div>
              </div>
            </div>
            
            <div className="flex items-center">
              <User className="w-5 h-5 text-ink-3 mr-3" />
              <div>
                <div className="text-sm text-ink-3">兑换学生</div>
                <div className="font-bold text-ink-1">{result.student_name}</div>
              </div>
            </div>

            <div className="flex items-center">
              <Clock className="w-5 h-5 text-ink-3 mr-3" />
              <div>
                <div className="text-sm text-ink-3">兑换时间</div>
                <div className="font-bold text-ink-1">{new Date(result.created_at).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
