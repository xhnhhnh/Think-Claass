import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { paymentApi } from '../payment';

describe('paymentApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  it('creates order with selected payment method', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });

    await paymentApi.createOrder('wechat');

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/payment/create',
      { method: 'wechat' },
      { showError: false },
    );
  });

  it('loads persisted order status by order number', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });

    await paymentApi.getOrderStatus('ORD-123');

    // A background poll must not toast on every failed tick.
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/payment/status/ORD-123', {
      showError: false,
    });
  });
});
