import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfileSettings from '@/features/auth/pages/ProfileSettingsPage';
import {
  clearReplayRequest,
  getReplayRequested,
} from '@/features/onboarding/startupGuideStore';

/**
 * The profile form's contract, moved with the page from `features/classroom/pages/TeacherSettingsPage`.
 *
 * The three placeholder strings and the `/保存更改/` button are what this suite reaches the form by,
 * so they are part of the contract rather than incidental copy: the move changed the page's location
 * and gave it a replay section, and neither was allowed to disturb them.
 *
 * The second test covers the one thing the move added. It asserts against the store rather than
 * against a rendered guide on purpose - the guide is mounted once above the router, so a settings
 * page that rendered it would be a second copy.
 */

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

describe('ProfileSettings', () => {
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

  afterEach(() => {
    clearReplayRequest();
  });

  it('updates the current profile through the auth feature API', async () => {
    render(<ProfileSettings />);

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

  it('asks for a replay when 重新开始引导 is pressed', () => {
    render(<ProfileSettings />);

    expect(getReplayRequested()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /重新开始引导/ }));

    expect(getReplayRequested()).toBe(true);
    // Pressing it did not touch the profile: the two actions on this page are unrelated.
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
