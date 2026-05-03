import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorldBoss: vi.fn(),
  deleteWorldBoss: vi.fn(),
  getWorldBosses: vi.fn(),
}));

vi.mock('@/api/challenge', () => ({
  challengeApi: {
    createWorldBoss: mocks.createWorldBoss,
    deleteWorldBoss: mocks.deleteWorldBoss,
    getWorldBosses: mocks.getWorldBosses,
  },
}));

import { useWorldBossMutation, useWorldBosses } from './useWorldBoss';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useWorldBoss hooks', () => {
  beforeEach(() => {
    mocks.createWorldBoss.mockReset();
    mocks.deleteWorldBoss.mockReset();
    mocks.getWorldBosses.mockReset();
  });

  it('loads world bosses through challengeApi', async () => {
    mocks.getWorldBosses.mockResolvedValue({ success: true, bosses: [{ id: 1, name: 'Boss' }] });
    const { result } = renderHook(() => useWorldBosses(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.getWorldBosses).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([{ id: 1, name: 'Boss' }]);
  });

  it('routes create and delete mutations through challengeApi', async () => {
    mocks.createWorldBoss.mockResolvedValue({ success: true });
    mocks.deleteWorldBoss.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useWorldBossMutation(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ type: 'create', data: { name: 'Boss' } });
    await result.current.mutateAsync({ type: 'delete', id: 3 });

    expect(mocks.createWorldBoss).toHaveBeenCalledWith({ name: 'Boss' });
    expect(mocks.deleteWorldBoss).toHaveBeenCalledWith(3);
  });
});

