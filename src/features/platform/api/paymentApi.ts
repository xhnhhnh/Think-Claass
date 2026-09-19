import { apiGet, apiPost } from '@/lib/api';
import type { PaymentMethod, PaymentOrderDto } from '@thinkclass/contracts/domains/platform';

export type { PaymentMethod } from '@thinkclass/contracts/domains/platform';
export type PaymentOrder = PaymentOrderDto;

export const paymentApi = {
  createOrder: (method: PaymentMethod) =>
    apiPost<{ success: true; message: string; data: PaymentOrder }>('/api/payment/create', { method }),
  getOrderStatus: (orderNo: string) =>
    apiGet<{ success: true; data: PaymentOrder }>(`/api/payment/status/${orderNo}`),
};
