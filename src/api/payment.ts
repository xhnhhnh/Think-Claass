import { apiGet, apiPost } from '@/lib/api';

export type PaymentMethod = 'wechat' | 'alipay';

export interface PaymentOrder {
  orderNo: string;
  status: string;
  amount: number;
  currency: string;
  qrCodeUrl: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  environment: string;
  providerMode: string;
}

export const paymentApi = {
  createOrder: (method: PaymentMethod) =>
    apiPost<{ success: true; message: string; data: PaymentOrder }>('/api/payment/create', { method }),
  getOrderStatus: (orderNo: string) =>
    apiGet<{ success: true; data: PaymentOrder }>(`/api/payment/status/${orderNo}`),
};
