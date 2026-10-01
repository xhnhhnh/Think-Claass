import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, CheckCircle2, KeyRound, LoaderCircle, ScanLine } from 'lucide-react';

import { paymentApi, type PaymentMethod, type PaymentOrder } from '@/features/platform/api/paymentApi';
import { useSettings } from '@/hooks/queries/useSettings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

/**
 * 扫码开通 - the direct-payment half of the revenue switch.
 *
 * The three pieces of this flow existed and never met: `plugins/payment` has providers for both
 * channels (plus a `mock` environment that issues simulated codes), `POST /api/payment/create` and
 * `GET /api/payment/status/:orderNo` are live routes, and this page was a static card saying
 * 「扫码支付稍后开发」 that nothing linked to - while `PrivateRoute` sent every unactivated account to
 * the activation-code page and the console refused to save `revenue_mode: 'direct_payment'`.
 *
 * The order of what a person does: pick a channel the operator enabled, create the order, show its
 * QR code (or payment link), then poll until the channel's callback has marked it PAID - at which
 * point `applyWebhook` has already flipped `users.is_activated` through
 * `identity.public.activateUser`, so the session's own flag is the only stale thing left.
 *
 * Two operator states are surfaced rather than hidden: a channel that is switched off is not
 * offered, and an unconfigured environment (the plugin's `PAYMENT_ENVIRONMENT_UNSET` 503) is shown
 * as the sentence to act on - never as a generic failure.
 */

type Phase = 'choose' | 'paying' | 'paid';

export default function Payment() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const { data: settings } = useSettings();

  const [method, setMethod] = useState<PaymentMethod>('wechat');
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const pollTimer = useRef<number | null>(null);

  const wechatEnabled = settings?.payment_enable_wechat === '1';
  const alipayEnabled = settings?.payment_enable_alipay === '1';

  // The first enabled channel is the default; a deployment with only Alipay must not open on a
  // channel whose button answers 400.
  useEffect(() => {
    if (!settings) return;
    if (wechatEnabled) setMethod('wechat');
    else if (alipayEnabled) setMethod('alipay');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.payment_enable_wechat, settings?.payment_enable_alipay]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const settle = useCallback(
    (paid: PaymentOrder) => {
      stopPolling();
      setOrder(paid);
      setPhase('paid');
      // The callback activated the account *before* marking the order paid (`applyWebhook` calls
      // `identity.activateUser` first), so the session's own flag is all that is stale - and it is
      // what `PrivateRoute` reads.
      if (user) {
        setUser({ ...user, is_activated: true });
      }
      toast.success('开通成功，欢迎使用');
    },
    [setUser, stopPolling, user],
  );

  const startPolling = useCallback(
    (orderNo: string) => {
      stopPolling();
      pollTimer.current = window.setInterval(async () => {
        try {
          const result = await paymentApi.getOrderStatus(orderNo);
          const current = result.data;
          if (current.status === 'PAID') {
            settle(current);
            return;
          }
          if (current.status === 'EXPIRED' || current.status === 'CANCELLED') {
            stopPolling();
            setStatusMessage('订单已过期，请重新下单。');
            setPhase('choose');
          }
        } catch {
          // A failed poll is not the end of the order: the next tick tries again, and the order's
          // own expiry is what ends it.
        }
      }, 3000);
    },
    [settle, stopPolling],
  );

  const handleCreate = async () => {
    setCreating(true);
    setStatusMessage('');
    try {
      const result = await paymentApi.createOrder(method);
      setOrder(result.data);
      setPhase('paying');
      if (result.data.status === 'PAID') {
        settle(result.data);
      } else {
        startPolling(result.data.orderNo);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '下单失败，请稍后重试';
      setStatusMessage(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleContinue = () => {
    if (user?.role === 'student') navigate('/student');
    else if (user?.role === 'parent') navigate('/parent');
    else navigate('/');
  };

  const channelsOff = settings !== undefined && !wechatEnabled && !alipayEnabled;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-1 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-panel border border-line-1 bg-surface-2 shadow-card">
        <div className="bg-gradient-to-r from-success-soft via-surface-2 to-warning-soft p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-surface-2 text-role shadow-card">
            <ScanLine className="h-8 w-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-fg-1">
            {phase === 'paid' ? '开通成功' : '扫码开通账号'}
          </h2>
          <p className="text-sm text-fg-3">
            {phase === 'paid'
              ? '账号已经开通，可以开始使用了。'
              : `使用${method === 'wechat' ? '微信' : '支付宝'}支付 ${settings?.payment_price ?? ''} ${settings?.payment_currency ?? ''}`}
          </p>
        </div>

        <div className="space-y-6 p-8">
          {settings?.payment_environment === 'mock' ? (
            <div className="rounded-card border border-warning/30 bg-warning-soft p-3 text-xs text-warning-ink">
              当前部署的支付环境是 <span className="font-bold">mock</span>：下单与回调都是模拟的，不会真的扣款。
            </div>
          ) : null}

          {channelsOff ? (
            <div className="rounded-card border border-danger/20 bg-danger/10 p-5 text-sm text-fg-2">
              管理员还没有启用任何支付渠道。请联系老师使用激活码开通，或让管理员在「系统设置 → 支付渠道」里启用微信/支付宝。
            </div>
          ) : phase === 'choose' ? (
            <>
              <div className="space-y-3">
                {(['wechat', 'alipay'] as PaymentMethod[]).map((channel) => {
                  const enabled = channel === 'wechat' ? wechatEnabled : alipayEnabled;
                  return (
                    <Button
                      key={channel}
                      type="button"
                      variant="outline"
                      disabled={!enabled}
                      onClick={() => setMethod(channel)}
                      className={cn(
                        'h-auto w-full justify-between rounded-card border-2 p-5 text-left text-lg font-bold',
                        method === channel && enabled
                          ? 'border-role bg-role-soft text-role-ink hover:bg-role-soft hover:text-role-ink'
                          : 'border-line-1 bg-surface-2 text-fg-2 hover:border-role/40',
                      )}
                    >
                      <span>{channel === 'wechat' ? '微信支付' : '支付宝'}</span>
                      {enabled ? <ArrowRight className="size-5" /> : <Badge variant="secondary">未启用</Badge>}
                    </Button>
                  );
                })}
              </div>

              {statusMessage ? <p className="text-sm text-danger">{statusMessage}</p> : null}

              <Button
                size="lg"
                className="h-12 w-full font-bold"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                {creating ? <LoaderCircle className="size-5 animate-spin" /> : '生成支付订单'}
              </Button>
            </>
          ) : phase === 'paying' && order ? (
            <>
              {order.qrCodeUrl ? (
                <img
                  src={order.qrCodeUrl}
                  alt="支付二维码"
                  className="mx-auto size-48 rounded-card border border-line-1 bg-surface-3"
                />
              ) : null}
              {order.paymentUrl ? (
                <a
                  href={order.paymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-all text-center text-sm text-role underline"
                >
                  前往支付页面
                </a>
              ) : null}

              <div className="rounded-card border border-line-1 bg-surface-3/60 p-4 text-sm text-fg-3">
                <div className="flex items-center justify-between">
                  <span>订单号</span>
                  <span className="font-mono text-fg-2">{order.orderNo}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>应付</span>
                  <span className="font-bold text-fg-1">
                    {order.amount} {order.currency}
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-2 text-xs text-fg-3">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  {statusMessage || '等待支付结果…支付完成后这个页面会自动继续。'}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" />
              <p className="text-sm text-fg-3">账号已开通，可以进入系统了。</p>
              <Button size="lg" className="h-12 w-full font-bold" onClick={handleContinue}>
                进入系统
              </Button>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full text-fg-3 hover:text-fg-1"
            onClick={() => navigate('/activate')}
          >
            <KeyRound data-icon="inline-start" />
            我有激活码
          </Button>
        </div>
      </div>
    </div>
  );
}
