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

import { shopApi } from '../shop';

describe('shopApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
  });

  it('loads student items', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, items: [] });
    await shopApi.getStudentItems();
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/shop/items');
  });

  it('posts blind box purchase', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, reward: '奖励' });
    await shopApi.buyBlindBox({ studentId: 8, blindBoxId: 3 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/blind_box', { studentId: 8, blindBoxId: 3 });
  });
});
