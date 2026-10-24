import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage from './LoginPage';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  verifyInviteCode: vi.fn(),
  setUser: vi.fn(),
  setToken: vi.fn(),
  user: null as null | { id: number; role: string; username: string },
}));

vi.mock('@/features/auth/api/authApi', () => ({
  authApi: {
    login: mocks.login,
    register: mocks.register,
    verifyInviteCode: mocks.verifyInviteCode,
  },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: mocks.user,
      setUser: mocks.setUser,
      setToken: mocks.setToken,
    }),
}));

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/teacher" element={<div>Teacher console</div>} />
          <Route path="/student" element={<div>Student console</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
  });

  it('shows the server’s credential message instead of a network claim', async () => {
    mocks.login.mockRejectedValue({
      response: { data: { message: '账号或密码错误，请重试' } },
    });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText('输入账号'), { target: { value: 'teacher01' } });
    fireEvent.change(screen.getByPlaceholderText('输入密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '开启旅程' }));

    expect(await screen.findByText('账号或密码错误，请重试')).toBeInTheDocument();
    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
    expect(screen.queryByText('登录已过期，请重新登录')).not.toBeInTheDocument();
  });

  it('tells the reader to check the role selector, because the server cannot', () => {
    renderLogin();

    expect(screen.getByText(/请选择与账号一致的身份/)).toBeInTheDocument();
  });

  it('does not make an already signed-in reader type their credentials again', async () => {
    mocks.user = { id: 5, role: 'teacher', username: 'teacher01' };
    renderLogin();

    await waitFor(() => expect(screen.getByText('Teacher console')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText('输入账号')).not.toBeInTheDocument();
  });
});
