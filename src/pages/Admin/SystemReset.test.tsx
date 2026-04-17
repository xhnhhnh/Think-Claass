import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SystemReset from './SystemReset';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/features/admin/hooks/useAdminSystem', () => ({
  useDatabaseResetMutation: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: { logout: typeof mocks.logout }) => unknown) =>
    selector({
      logout: mocks.logout,
    }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

describe('SystemReset', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.logout.mockReset();
    mocks.navigate.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.mutateAsync.mockResolvedValue({
      message: '所有数据已重置，并已恢复超级管理员账户',
      preservedSuperadmins: 1,
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('calls the real reset contract after confirmation', async () => {
    render(
      <MemoryRouter>
        <SystemReset />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入 CONFIRM'), {
      target: { value: 'CONFIRM' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认并立即重置系统' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('所有数据已重置，并已恢复超级管理员账户');
  });
});
