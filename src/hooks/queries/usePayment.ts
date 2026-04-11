import { useQuery } from '@tanstack/react-query';

import { paymentApi } from '@/api/payment';

export function usePaymentOrderStatus(orderNo: string | null, enabled = true) {
  return useQuery({
    queryKey: ['payment-order-status', orderNo],
    queryFn: async () => {
      if (!orderNo) return null;
      const data = await paymentApi.getOrderStatus(orderNo);
      return data.data;
    },
    enabled: enabled && !!orderNo,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== 'PAID' ? 3000 : false;
    },
  });
}
