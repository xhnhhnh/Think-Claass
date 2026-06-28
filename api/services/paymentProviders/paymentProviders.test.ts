import { describe, expect, it } from 'vitest';

import { createPaymentProvider } from './index';

describe('createPaymentProvider', () => {
  it('keeps mock payments on the mock provider instead of requiring real channel credentials', async () => {
    const provider = createPaymentProvider('wechat', 'mock');

    const order = await provider.createOrder({
      orderNo: 'ORD-MOCK-1',
      amount: 99,
      description: 'Think-Class platform activation',
      method: 'wechat',
      notifyUrl: 'https://example.test/api/payment/notify',
    });

    expect(order.provider).toBe('wechat');
    expect(order.qrCodeUrl).toContain('/wechat/ORD-MOCK-1');
    expect(order.payload).toMatchObject({
      environment: 'mock',
      providerMode: 'mock',
      method: 'wechat',
      orderNo: 'ORD-MOCK-1',
    });
  });
});
