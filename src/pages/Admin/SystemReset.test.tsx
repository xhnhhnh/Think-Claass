import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SystemReset from './SystemReset';

const mocks = vi.hoisted(() => ({
  resetDatabase: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/admin', () => ({
  adminApi: {
    resetDatabase: mocks.resetDatabase,
  },
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
    mocks.resetDatabase.mockReset();
    mocks.logout.mockReset();
    mocks.navigate.mockReset();
    mocks.resetDatabase.mockResolvedValue({ success: true, message: '所有数据已重置' });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('calls the real reset contract after confirmation', async () => {
    render(
      <MemoryRouter>
        <SystemReset />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('输入 CONFIRM'), {
      target: { value: 'CONFIRM' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认并立即重置系统' }));

    await waitFor(() => {
      expect(mocks.resetDatabase).toHaveBeenCalledTimes(1);
    });

    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
