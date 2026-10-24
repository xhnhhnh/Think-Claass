import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ActivatePage from './ActivatePage';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  setUser: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/auth/api/authApi', () => ({
  authApi: { activate: mocks.activate },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: 9, role: 'student', username: 'student9' },
      setUser: mocks.setUser,
    }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function renderActivate() {
  return render(
    <MemoryRouter initialEntries={['/activate']}>
      <Routes>
        <Route path="/activate" element={<ActivatePage />} />
        <Route path="/student" element={<div>Student console</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ActivatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows what the server said about the code, not a network excuse', async () => {
    mocks.activate.mockRejectedValue({ response: { data: { message: '无效的激活码' } } });
    renderActivate();

    fireEvent.change(screen.getByPlaceholderText('请输入 12 位专属激活码'), {
      target: { value: 'WRONGCODE123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /立即激活/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('无效的激活码');
    expect(screen.queryByText(/网络错误/)).not.toBeInTheDocument();
  });

  it('marks the session activated and enters the right console', async () => {
    mocks.activate.mockResolvedValue({ success: true });
    renderActivate();

    fireEvent.change(screen.getByPlaceholderText('请输入 12 位专属激活码'), {
      target: { value: 'GOODCODE123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /立即激活/ }));

    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ is_activated: true })),
    );
    expect(screen.getByText('Student console')).toBeInTheDocument();
  });
});
