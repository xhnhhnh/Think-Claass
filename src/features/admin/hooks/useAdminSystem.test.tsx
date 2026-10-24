import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminQueryKeys, useUpdateAdminSystemSettingsMutation } from './useAdminSystem';

const mocks = vi.hoisted(() => ({
  updateSystemSettings: vi.fn(),
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: {
    updateSystemSettings: mocks.updateSystemSettings,
  },
}));

function createWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useUpdateAdminSystemSettingsMutation', () => {
  beforeEach(() => {
    mocks.updateSystemSettings.mockReset();
    mocks.updateSystemSettings.mockResolvedValue({ site_title: '新标题' });
  });

  it('invalidates the public settings query, not just the admin one', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    client.setQueryData(['settings'], { site_title: '旧标题' });
    client.setQueryData(adminQueryKeys.settings, { site_title: '旧标题' });

    const { result } = renderHook(() => useUpdateAdminSystemSettingsMutation(), {
      wrapper: createWrapper(client),
    });

    result.current.mutate({ site_title: '新标题' });

    await waitFor(() => {
      expect(client.getQueryState(['settings'])?.isInvalidated).toBe(true);
    });
    expect(client.getQueryData(adminQueryKeys.settings)).toEqual({ site_title: '新标题' });
  });
});
