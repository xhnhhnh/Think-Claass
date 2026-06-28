import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherSettings from './Settings';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updateTeacher: vi.fn(),
  setUser: vi.fn(),
  user: {
    id: 5,
    role: 'teacher',
    username: 'old-teacher',
    is_activated: true,
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/auth/api/authApi', () => ({
  authApi: {
    updateProfile: mocks.updateProfile,
  },
}));

vi.mock('@/api/admin', () => ({
  adminApi: {
    updateTeacher: mocks.updateTeacher,
  },
}));

vi.mock('@/store/useStore', () => ({
  useStore: () => ({
    user: mocks.user,
    setUser: mocks.setUser,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('TeacherSettings', () => {
  beforeEach(() => {
    mocks.updateProfile.mockReset();
    mocks.updateTeacher.mockReset();
    mocks.setUser.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    mocks.updateProfile.mockResolvedValue({
      success: true,
      user: {
        id: 5,
        role: 'teacher',
        username: 'new-teacher',
        is_activated: true,
      },
    });
    mocks.updateTeacher.mockResolvedValue({
      success: true,
      user: {
        id: 5,
        role: 'teacher',
        username: 'new-teacher',
        is_activated: true,
      },
    });
  });

  it('updates the current teacher profile through the auth feature API', async () => {
    render(<TeacherSettings />);

    fireEvent.change(screen.getByPlaceholderText('请输入新的用户名'), {
      target: { value: 'new-teacher' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入新密码'), {
      target: { value: 'new-pass' },
    });
    fireEvent.change(screen.getByPlaceholderText('请再次输入新密码'), {
      target: { value: 'new-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /保存更改/ }));

    await waitFor(() => {
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        username: 'new-teacher',
        password: 'new-pass',
      });
    });
    expect(mocks.updateTeacher).not.toHaveBeenCalled();
    expect(mocks.setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        role: 'teacher',
        username: 'new-teacher',
        is_activated: true,
      }),
    );
  });
});
