import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiDelete: mocks.apiDelete,
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { shopApi } from '../shop';

describe('shopApi', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset();
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

  it('creates and updates auctions with write methods', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, id: 1 });
    mocks.apiPut.mockResolvedValue({ success: true });

    const payload = { item_name: '拍品', description: '描述', starting_price: 100, end_time: '2026-05-04T10:00', status: 'active' as const };
    await shopApi.createAuction(payload);
    await shopApi.updateAuction(7, payload);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/auctions', payload);
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/auctions/7', payload);
  });

  it('deletes auctions with DELETE', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true });
    await shopApi.deleteAuction(7);
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/shop/auctions/7');
  });

  it('creates, updates, toggles, and deletes blind boxes with write methods', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, id: 2 });
    mocks.apiPut.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    const payload = { name: '盲盒', description: '描述', price: 50, is_active: true };
    await shopApi.createBlindBox(payload);
    await shopApi.updateBlindBox(2, payload);
    await shopApi.toggleBlindBox({ id: 2, name: '盲盒', description: '描述', price: 50, is_active: 1 });
    await shopApi.deleteBlindBox(2);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/blind_boxes', payload);
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/blind_boxes/2', payload);
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/blind_boxes/2', {
      id: 2,
      name: '盲盒',
      description: '描述',
      price: 50,
      is_active: false,
    });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/shop/blind_boxes/2');
  });
});
