import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { CreditCard, ExternalLink, LoaderCircle, ScanLine, ShieldCheck, Smartphone } from 'lucide-react';

import { paymentApi, type PaymentMethod } from '@/api/payment';
import { usePaymentOrderStatus } from '@/hooks/queries/usePayment';
import { useSettings } from '@/hooks/queries/useSettings';

export default function Payment() {
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat');
  const user = useStore(state => state.user);
  const setUser = useStore(state => state.setUser);
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: orderStatus, isLoading: isStatusLoading } = usePaymentOrderStatus(orderNo);

  const createOrderMutation = useMutation({
    mutationFn: paymentApi.createOrder,
    onSuccess: (data) => {
      setOrderNo(data.data.orderNo);
      toast.success('订单创建成功，请完成支付');
    },
    onError: () => {
      toast.error('网络错误，无法连接支付网关');
    },
  });

  useEffect(() => {
    if (user?.is_activated) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (orderStatus?.status === 'PAID' && user) {
      toast.success('支付成功！系统已激活');
      setUser({ ...user, is_activated: true });
      navigate('/');
    }
  }, [orderStatus?.status, user, setUser, navigate]);

  const enabledMethods = useMemo(() => ({
    wechat: settings?.payment_enable_wechat !== '0',
    alipay: settings?.payment_enable_alipay !== '0',
  }), [settings]);

  useEffect(() => {
    if (paymentMethod === 'wechat' && !enabledMethods.wechat && enabledMethods.alipay) {
      setPaymentMethod('alipay');
    }
    if (paymentMethod === 'alipay' && !enabledMethods.alipay && enabledMethods.wechat) {
      setPaymentMethod('wechat');
    }
  }, [enabledMethods.alipay, enabledMethods.wechat, paymentMethod]);

  const handleCreateOrder = async () => {
    await createOrderMutation.mutateAsync(paymentMethod);
  };

  const currentOrder = orderStatus ?? createOrderMutation.data?.data ?? null;
  const amountLabel = settings?.payment_price ?? '99.00';
  const description = settings?.payment_description ?? 'Think-Class 平台激活';
  const runtimeEnvironment = currentOrder?.environment ?? settings?.payment_environment ?? 'mock';
  const providerMode = currentOrder?.providerMode ?? 'mock';
  const noPaymentMethodEnabled = !enabledMethods.wechat && !enabledMethods.alipay;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">解锁完整平台功能</h2>
          <p className="text-blue-100 text-sm">支付后即刻激活您的专属账号</p>
        </div>

        <div className="p-8">
          {!orderNo ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">选择支付方式</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setPaymentMethod('wechat')}
                    disabled={!enabledMethods.wechat}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                      paymentMethod === 'wechat' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-emerald-200'
                    } disabled:opacity-50`}
                  >
                    <Smartphone className="w-8 h-8 mb-2" />
                    <span className="font-medium">微信支付</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('alipay')}
                    disabled={!enabledMethods.alipay}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                      paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200'
                    } disabled:opacity-50`}
                  >
                    <ScanLine className="w-8 h-8 mb-2" />
                    <span className="font-medium">支付宝</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                <span className="text-slate-600">需支付金额</span>
                <span className="text-2xl font-bold text-slate-800">¥ {amountLabel}</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">{description}</p>
                <p className="mt-2">支付环境：{runtimeEnvironment}</p>
                <p className="mt-1">渠道适配器：{providerMode}</p>
                <p className="mt-2 text-xs text-amber-600">
                  当前仓库仍使用 mock 渠道适配层，适合演练订单与激活闭环；若切换到 sandbox 或 production，仍需后续接入真实支付 SDK 与密钥配置。
                </p>
              </div>

              <button
                onClick={handleCreateOrder}
                disabled={createOrderMutation.isPending || noPaymentMethodEnabled}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 disabled:opacity-50"
              >
                {createOrderMutation.isPending ? '正在创建订单...' : noPaymentMethodEnabled ? '当前无可用支付方式' : '立即支付'}
              </button>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <h3 className="text-lg font-medium text-slate-800">
                请使用 {paymentMethod === 'wechat' ? '微信' : '支付宝'} 扫码支付
              </h3>
              
              <div className="flex justify-center">
                <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm">
                  <div className="w-[200px] h-[200px] bg-slate-100 flex items-center justify-center rounded-xl border border-slate-200 relative overflow-hidden">
                    {currentOrder?.qrCodeUrl ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentOrder.qrCodeUrl)}`}
                        alt="支付二维码"
                        className="h-[200px] w-[200px]"
                      />
                    ) : (
                      <div className="relative z-10 flex flex-col items-center">
                        <ScanLine className="w-10 h-10 text-slate-400 mb-2" />
                        <span className="text-sm text-slate-500">等待支付链接</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm flex items-start text-left">
                <ShieldCheck className="w-5 h-5 mr-2 flex-shrink-0" />
                <div className="space-y-1">
                  <p>订单号：{currentOrder?.orderNo || orderNo}</p>
                  <p>当前状态：{isStatusLoading ? '查询中...' : currentOrder?.status || 'PENDING'}</p>
                  <p>支付环境：{runtimeEnvironment}</p>
                  <p>渠道适配器：{providerMode}</p>
                  <p>若支付网关返回链接，也可直接打开支付页。</p>
                </div>
              </div>

              {currentOrder?.paymentUrl && (
                <a
                  href={currentOrder.paymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-50 px-4 py-3 font-medium text-blue-700 hover:bg-blue-100"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  打开支付链接
                </a>
              )}

              {currentOrder?.status !== 'PAID' && (
                <div className="flex items-center justify-center text-sm text-slate-500">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  正在自动轮询订单状态...
                </div>
              )}

              <button
                onClick={() => {
                  setOrderNo(null);
                }}
                className="text-slate-500 text-sm hover:text-slate-800 transition-colors"
              >
                返回重新选择支付方式
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
