import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createStock: vi.fn(),
  deleteStock: vi.fn(),
  deposit: vi.fn(),
  getOverview: vi.fn(),
  getStocks: vi.fn(),
  updateStock: vi.fn(),
}));

vi.mock('../api/economyApi', () => ({
  economyApi: {
    createStock: mocks.createStock,
    deleteStock: mocks.deleteStock,
    deposit: mocks.deposit,
    getOverview: mocks.getOverview,
    getStocks: mocks.getStocks,
    updateStock: mocks.updateStock,
    withdraw: vi.fn(),
    buyStock: vi.fn(),
    sellStock: vi.fn(),
  },
}));

import { economyQueryKeys, useEconomyBankMutation, useEconomyData, useTeacherStockMutation, useTeacherStocks } from './useEconomy';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { Wrapper, invalidateSpy };
}

describe('economy feature hooks', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('loads overview with 15s refetch interval', async () => {
    mocks.getOverview.mockResolvedValue({ success: true, data: { bank: null, stocks: [], portfolio: [] } });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEconomyData(7, 3), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.getOverview).toHaveBeenCalledWith(7, 3);
  });

  it('invalidates economy data after bank mutation', async () => {
    mocks.deposit.mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useEconomyBankMutation(7), { wrapper: Wrapper });

    await result.current.mutateAsync({ action: 'deposit', amount: 20 });

    expect(mocks.deposit).toHaveBeenCalledWith(7, 20);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['economy'] });
  });

  it('loads and mutates teacher stocks', async () => {
    mocks.getStocks.mockResolvedValue({ success: true, data: { stocks: [{ id: 1, name: '课堂之星' }] } });
    mocks.updateStock.mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = createWrapper();
    const query = renderHook(() => useTeacherStocks(3), { wrapper: Wrapper });

    await waitFor(() => expect(query.result.current.isSuccess).toBe(true));

    const mutation = renderHook(() => useTeacherStockMutation(3), { wrapper: Wrapper });
    const payload = { class_id: 3, name: '课堂之星', symbol: 'STAR', current_price: 120 };
    await mutation.result.current.mutateAsync({ type: 'update', stockId: 1, data: payload });

    expect(mocks.getStocks).toHaveBeenCalledWith(3);
    expect(mocks.updateStock).toHaveBeenCalledWith(1, payload);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: economyQueryKeys.stocks(3) });
  });
});
