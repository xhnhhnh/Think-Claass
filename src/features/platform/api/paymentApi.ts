import { apiGet, apiPost } from '@/lib/api';
import type { PaymentMethod, PaymentOrderDto } from '@/shared/platform/contracts';

export type { PaymentMethod } from '@/shared/platform/contracts';
export type PaymentOrder = PaymentOrderDto;

export const paymentApi = {
  createOrder: (method: PaymentMethod) =>
    apiPost<{ success: true; message: string; data: PaymentOrder }>('/api/payment/create', { method }),
  getOrderStatus: (orderNo: string) =>
    apiGet<{ success: true; data: PaymentOrder }>(`/api/payment/status/${orderNo}`),
};
