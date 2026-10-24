import { apiGet, apiPost } from '@/lib/api';
import type { PaymentMethod, PaymentOrderDto } from '@thinkclass/contracts/domains/platform';

export type { PaymentMethod } from '@thinkclass/contracts/domains/platform';
export type PaymentOrder = PaymentOrderDto;

export const paymentApi = {
  createOrder: (method: PaymentMethod) =>
    apiPost<{ success: true; message: string; data: PaymentOrder }>(
      '/api/payment/create',
      { method },
      // The page renders the reason inline and keeps the form; a toast on top would be a duplicate.
      { showError: false },
    ),
  // Polling is a background check: a failed tick must not toast every three seconds.
  getOrderStatus: (orderNo: string) =>
    apiGet<{ success: true; data: PaymentOrder }>(`/api/payment/status/${orderNo}`, {
      showError: false,
    }),
};
