import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle, Search, Gift, User, Clock } from 'lucide-react';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { toast } from 'sonner';

import { useRedemptionVerifyMutation } from '@/hooks/queries/useRedemption';

/**
 * 奖品核销.
 *
 * A one-field form, so the scaffold is `form`: the heading that used to live inside the
 * panel is the scaffold's `title`/`description`, and the code field keeps its padding
 * and monospace tracking on the kit's `Input`.
 */
export default function TeacherVerification() {
  const user = useStore((state) => state.user);
  const [code, setCode] = useState('');
  const verifyMutation = useRedemptionVerifyMutation();
  const loading = verifyMutation.isPending;
  const [result, setResult] = useState<any>(null);

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
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

  // The page's one action, reachable from the command palette as well as the button.
  useRegisterPageCommands([
    {
      id: 'teacher-verification:verify',
      label: '确认核销',
      icon: CheckCircle,
      keywords: ['核销', '兑换', '奖品'],
      disabled: loading || !code.trim(),
      run: () => void handleVerify(),
    },
  ]);

  return (
    <PageScaffold
      variant="form"
      title="奖品核销"
      description="输入学生提供的核销码进行奖品兑换核销"
      contentClassName="mx-auto max-w-2xl"
    >
      <div className="rounded-panel border border-line-1 bg-surface-2/80 p-8 shadow-card backdrop-blur-xl">
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-2 mb-2">核销码</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="size-5 text-fg-3" />
              </div>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例如: RED-123456789"
                className="block w-full pl-11 pr-4 py-4 text-lg border-2 border-line-1 rounded-card font-mono tracking-wider placeholder:text-fg-3"
                autoFocus
              />
            </div>
          </div>
          
          <Button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-card shadow-card text-lg font-bold text-role-contrast bg-gradient-to-r from-role to-role-ink hover:from-role/90 hover:to-role-ink/90 disabled:opacity-50 transition-colors"
          >
            {loading ? '核销中...' : '确认核销'}
          </Button>
        </form>
      </div>

      {result && (
        <div className="bg-role/5 border-2 border-role/20 p-8 rounded-panel shadow-card animate-slide-in-bottom">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-role to-role-ink rounded-full p-2 mr-3">
              <CheckCircle className="size-6 text-role-contrast" />
            </div>
            <h3 className="text-2xl font-bold text-role">核销成功</h3>
          </div>
          
          <div className="bg-surface-2/80 backdrop-blur-xl rounded-card p-6 space-y-4 border border-success/20 shadow-card">
            <div className="flex items-center">
              <Gift className="size-5 text-fg-3 mr-3" />
              <div>
                <div className="text-sm text-fg-3">兑换商品</div>
                <div className="font-bold text-fg-1 text-lg">{result.item_name}</div>
              </div>
            </div>
            
            <div className="flex items-center">
              <User className="size-5 text-fg-3 mr-3" />
              <div>
                <div className="text-sm text-fg-3">兑换学生</div>
                <div className="font-bold text-fg-1">{result.student_name}</div>
              </div>
            </div>

            <div className="flex items-center">
              <Clock className="size-5 text-fg-3 mr-3" />
              <div>
                <div className="text-sm text-fg-3">兑换时间</div>
                <div className="font-bold text-fg-1">{new Date(result.created_at).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageScaffold>
  );
}
