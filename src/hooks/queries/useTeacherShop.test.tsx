import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuction: vi.fn(),
  createBlindBox: vi.fn(),
  deleteAuction: vi.fn(),
  deleteBlindBox: vi.fn(),
  getAuctions: vi.fn(),
  getBlindBoxes: vi.fn(),
  toggleBlindBox: vi.fn(),
  updateAuction: vi.fn(),
  updateBlindBox: vi.fn(),
}));

vi.mock('@/api/shop', () => ({
  shopApi: {
    createAuction: mocks.createAuction,
    createBlindBox: mocks.createBlindBox,
    deleteAuction: mocks.deleteAuction,
    deleteBlindBox: mocks.deleteBlindBox,
    getAllItems: vi.fn(),
    getAuctions: mocks.getAuctions,
    getBlindBoxes: mocks.getBlindBoxes,
    toggleBlindBox: mocks.toggleBlindBox,
    updateAuction: mocks.updateAuction,
    updateBlindBox: mocks.updateBlindBox,
  },
}));

import {
  teacherMarketplaceKeys,
  useTeacherAuctionMutation,
  useTeacherAuctions,
  useTeacherBlindBoxMutation,
  useTeacherBlindBoxes,
} from './useTeacherShop';

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

describe('teacher marketplace hooks', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('loads auctions with the teacher auction key', async () => {
    mocks.getAuctions.mockResolvedValue({ success: true, auctions: [{ id: 1, item_name: '拍品' }] });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTeacherAuctions(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: 1, item_name: '拍品' }]);
    expect(mocks.getAuctions).toHaveBeenCalledTimes(1);
  });

  it('mutates auctions and invalidates auction/student shop keys', async () => {
    mocks.createAuction.mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useTeacherAuctionMutation(), { wrapper: Wrapper });

    await result.current.mutateAsync({ type: 'create', data: { item_name: '拍品', description: '', starting_price: 100, end_time: '2026-05-04T10:00' } });

    expect(mocks.createAuction).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: teacherMarketplaceKeys.auctions });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: teacherMarketplaceKeys.studentShopData });
  });

  it('loads blind boxes and routes toggle mutation through shopApi', async () => {
    mocks.getBlindBoxes.mockResolvedValue({ success: true, boxes: [{ id: 2, name: '盲盒', is_active: 1 }] });
    mocks.toggleBlindBox.mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = createWrapper();
    const query = renderHook(() => useTeacherBlindBoxes(), { wrapper: Wrapper });

    await waitFor(() => expect(query.result.current.isSuccess).toBe(true));

    const mutation = renderHook(() => useTeacherBlindBoxMutation(), { wrapper: Wrapper });
    await mutation.result.current.mutateAsync({ type: 'toggle', box: { id: 2, name: '盲盒', description: '', price: 50, is_active: 1 } });

    expect(mocks.getBlindBoxes).toHaveBeenCalled();
    expect(mocks.toggleBlindBox).toHaveBeenCalledWith({ id: 2, name: '盲盒', description: '', price: 50, is_active: 1 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: teacherMarketplaceKeys.blindBoxes });
  });
});
