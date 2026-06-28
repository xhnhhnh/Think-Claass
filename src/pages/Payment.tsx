import { ArrowRight, KeyRound, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Payment() {
  const navigate = useNavigate();

  return (
    <div className="public-campus-page flex min-h-screen flex-col items-center justify-center bg-[var(--campus-canvas)] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-[var(--campus-border)] bg-white shadow-sm">
        <div className="bg-gradient-to-r from-emerald-50 via-white to-orange-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
            <ScanLine className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-950">扫码支付稍后开发</h2>
          <p className="text-sm text-slate-500">本轮请使用卡密/激活码完成账号开通。</p>
        </div>

        <div className="space-y-6 p-8">
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
            微信、支付宝扫码支付入口已从主流程中暂时下线，避免进入未完成的支付链路。管理员可在超级后台生成卡密，学生或家长在激活页输入卡密后即可开通账号。
          </div>

          <button
            type="button"
            onClick={() => navigate('/activate')}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-700 py-3.5 font-bold text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            <KeyRound className="mr-2 h-5 w-5" />
            前往输入卡密
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
