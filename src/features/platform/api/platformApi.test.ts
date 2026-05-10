import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { parentBuffApi } from './parentBuffApi';
import { paymentApi } from './paymentApi';
import { settingsApi } from './settingsApi';

describe('platform APIs', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('keeps settings paths stable', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });

    await settingsApi.getSettings();
    await settingsApi.updateAdminSettings({ site_title: 'Think' });

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/settings');
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/admin/system/settings', { site_title: 'Think' });
  });

  it('uses payment and parent buff paths', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiGet.mockResolvedValue({ success: true });

    await paymentApi.createOrder('wechat');
    await paymentApi.getOrderStatus('ORDER-1');
    await parentBuffApi.cast(7);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/payment/create', { method: 'wechat' });
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/payment/status/ORDER-1');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/parent-buff', { studentId: 7 });
  });
});
