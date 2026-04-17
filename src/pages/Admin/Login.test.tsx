import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_PATH } from '@/constants';
import AdminLogin from './Login';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setUser: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock('@/features/admin/hooks/useAdminSystem', () => ({
  useAdminSessionMutation: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: { setUser: typeof mocks.setUser }) => unknown) =>
    selector({
      setUser: mocks.setUser,
    }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

describe('AdminLogin', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.setUser.mockReset();
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue({
      user: {
        id: 1,
        role: 'superadmin',
        username: 'root',
      },
    });
  });

  it('stores the admin session and redirects to the admin shell', async () => {
    render(
      <MemoryRouter>
        <AdminLogin />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入超级管理员账号'), {
      target: { value: 'root' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入控制台' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        username: 'root',
        password: 'secret',
      });
    });

    expect(mocks.setUser).toHaveBeenCalledWith({
      id: 1,
      role: 'superadmin',
      username: 'root',
    });
    expect(mocks.navigate).toHaveBeenCalledWith(ADMIN_PATH);
  });
});
