import { ArrowRight, KeyRound, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';

/**
 * Landing page for the payment route, which currently routes users to activation
 * instead. The card, the notice and the action come from the kit and its tokens;
 * the `public-campus-page` class this page used to carry is gone with the rest of
 * P3's portal work.
 *
 * Public site, so it wears no console page scaffold: `/payment` is a flat route with no
 * console shell above it. The two strings `Payment.test.tsx` asserts - 扫码支付稍后开发 and
 * 本轮请使用卡密/激活码完成账号开通。 - are unchanged, as is the button's name.
 */
export default function Payment() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-1 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-panel border border-line-1 bg-surface-2 shadow-card">
        <div className="bg-gradient-to-r from-success-soft via-surface-2 to-warning-soft p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-surface-2 text-role shadow-card">
            <ScanLine className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-fg-1">扫码支付稍后开发</h2>
          <p className="text-sm text-fg-3">本轮请使用卡密/激活码完成账号开通。</p>
        </div>

        <div className="space-y-6 p-8">
          <div className="rounded-panel border border-warning/20 bg-warning-soft p-5 text-sm leading-6 text-warning-ink">
            微信、支付宝扫码支付入口已从主流程中暂时下线，避免进入未完成的支付链路。管理员可在超级后台生成卡密，学生或家长在激活页输入卡密后即可开通账号。
          </div>

          <Button
            type="button"
            size="lg"
            onClick={() => navigate('/activate')}
            className="h-12 w-full font-bold"
          >
            <KeyRound data-icon="inline-start" />
            前往输入卡密
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  );
}
