import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { ShieldCheck, CreditCard, ScanLine, Smartphone } from 'lucide-react';

export default function Payment() {
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');
  const user = useStore(state => state.user);
  const setUser = useStore(state => state.setUser);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.is_activated) {
      navigate('/');
    }
  }, [user, navigate]);

  // Handle creating payment order
  const handleCreateOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, method: paymentMethod, amount: 99.00 }) // Example amount
      });
      const data = await res.json();
      if (data.success) {
        setOrderId(data.data.orderId);
        setQrCodeUrl(data.data.qrCodeUrl);
        toast.success('订单创建成功，请扫码支付');
      } else {
        toast.error(data.message || '创建订单失败');
      }
    } catch (error) {
      toast.error('网络错误，无法连接支付网关');
    } finally {
      setLoading(false);
    }
  };

  // Polling for payment status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (orderId && user) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/payment/status/${orderId}?userId=${user.id}`);
          const data = await res.json();
          if (data.success && data.data.status === 'SUCCESS') {
            clearInterval(interval);
            toast.success('支付成功！系统已激活');
            setUser({ ...user, is_activated: true });
            navigate('/');
          }
        } catch (e) {
          console.error('Failed to poll payment status', e);
        }
      }, 3000); // Poll every 3 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [orderId, user, setUser, navigate]);

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
          {!orderId ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">选择支付方式</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setPaymentMethod('wechat')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                      paymentMethod === 'wechat' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-emerald-200'
                    }`}
                  >
                    <Smartphone className="w-8 h-8 mb-2" />
                    <span className="font-medium">微信支付</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('alipay')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                      paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200'
                    }`}
                  >
                    <ScanLine className="w-8 h-8 mb-2" />
                    <span className="font-medium">支付宝</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                <span className="text-slate-600">需支付金额</span>
                <span className="text-2xl font-bold text-slate-800">¥ 99.00</span>
              </div>

              <button
                onClick={handleCreateOrder}
                disabled={loading}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 disabled:opacity-50"
              >
                {loading ? '正在连接支付网关...' : '立即支付'}
              </button>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <h3 className="text-lg font-medium text-slate-800">
                请使用 {paymentMethod === 'wechat' ? '微信' : '支付宝'} 扫码支付
              </h3>
              
              <div className="flex justify-center">
                <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm">
                  {/* For real implementation, you would use qrcode.react to render the qrCodeUrl */}
                  {/* <QRCode value={qrCodeUrl} size={200} /> */}
                  <div className="w-[200px] h-[200px] bg-slate-100 flex items-center justify-center rounded-xl border border-slate-200 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=MOCK_PAYMENT')] bg-cover opacity-20 blur-[2px]"></div>
                    <div className="relative z-10 flex flex-col items-center">
                      <ScanLine className="w-10 h-10 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-500">模拟支付二维码</span>
                      <span className="text-xs text-slate-400 mt-1">仅作演示用途</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm flex items-start text-left">
                <ShieldCheck className="w-5 h-5 mr-2 flex-shrink-0" />
                <p>这是支付接口的演示框架。在真实环境中，这里会显示支付网关返回的实际二维码。您可以调用后端 Mock 接口模拟支付成功。</p>
              </div>

              <button
                onClick={() => {
                  setOrderId(null);
                  setQrCodeUrl(null);
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