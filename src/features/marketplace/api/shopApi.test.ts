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

import { shopApi } from './shopApi';

describe('shopApi', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('keeps marketplace read paths stable', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });

    await shopApi.getAllItems();
    await shopApi.getTeacherItems(7);
    await shopApi.getStudentItems();
    await shopApi.getAuctions();
    await shopApi.getBlindBoxes();

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/shop/all');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/shop/all?teacherId=7');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/shop/items');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/shop/auctions');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/shop/blind_boxes');
  });

  it('uses correct verbs for shop item writes and purchases', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });

    await shopApi.createItem({ name: '铅笔', price: 10 });
    await shopApi.updateItem(2, { price: 12 });
    await shopApi.updateStatus(2, 0);
    await shopApi.buyItem({ studentId: 3, itemId: 2 });

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop', { name: '铅笔', price: 10 });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/2', { price: 12 });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/2/status', { is_active: 0 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/buy', { studentId: 3, itemId: 2 });
  });

  it('uses auction and blind box write paths', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    await shopApi.createAuction({ item_name: '拍品', description: '', starting_price: 20, end_time: '2026-05-05T10:00' });
    await shopApi.updateAuction(4, { item_name: '拍品2', description: '', starting_price: 30, end_time: '2026-05-05T11:00' });
    await shopApi.bidAuction(4, { studentId: 8, bid_amount: 50 });
    await shopApi.deleteAuction(4);
    await shopApi.createBlindBox({ name: '盲盒', description: '', price: 15, is_active: true });
    await shopApi.updateBlindBox(5, { name: '盲盒2', description: '', price: 20, is_active: false });
    await shopApi.toggleBlindBox({ id: 5, name: '盲盒2', description: '', price: 20, is_active: 1 });
    await shopApi.deleteBlindBox(5);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/auctions', { item_name: '拍品', description: '', starting_price: 20, end_time: '2026-05-05T10:00' });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/auctions/4', { item_name: '拍品2', description: '', starting_price: 30, end_time: '2026-05-05T11:00' });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/auctions/4/bid', { studentId: 8, bid_amount: 50 });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/shop/auctions/4');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/shop/blind_boxes', { name: '盲盒', description: '', price: 15, is_active: true });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/blind_boxes/5', { name: '盲盒2', description: '', price: 20, is_active: false });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/shop/blind_boxes/5', { id: 5, name: '盲盒2', description: '', price: 20, is_active: false });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/shop/blind_boxes/5');
  });
});
