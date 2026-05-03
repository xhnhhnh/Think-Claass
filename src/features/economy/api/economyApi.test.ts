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

import { economyApi } from './economyApi';

describe('economyApi', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('loads student overview through the new REST path', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: { bank: null, stocks: [], portfolio: [] } });
    await economyApi.getOverview(7, 3);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/economy/students/7/overview?classId=3');
  });

  it('uses new banking and trading write paths', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });

    await economyApi.deposit(7, 20);
    await economyApi.withdraw(7, 10);
    await economyApi.buyStock(7, { stockId: 2, shares: 3 });
    await economyApi.sellStock(7, { stockId: 2, shares: 1 });

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/economy/students/7/bank/deposits', { amount: 20 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/economy/students/7/bank/withdrawals', { amount: 10 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/economy/students/7/stocks/buy', { stockId: 2, shares: 3 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/economy/students/7/stocks/sell', { stockId: 2, shares: 1 });
  });

  it('supports teacher stock CRUD', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    const payload = { class_id: 3, name: '课堂之星', symbol: 'STAR', current_price: 100 };
    await economyApi.createStock(payload);
    await economyApi.updateStock(9, payload);
    await economyApi.deleteStock(9);

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/economy/teacher/stocks', payload);
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/economy/teacher/stocks/9', payload);
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/economy/teacher/stocks/9');
  });
});
