import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminTeachers from './AdminTeachersPage';

const mocks = vi.hoisted(() => ({
  getTeachers: vi.fn(),
  createTeacher: vi.fn(),
  updateTeacher: vi.fn(),
  deleteTeacher: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: {
    getTeachers: mocks.getTeachers,
    createTeacher: mocks.createTeacher,
    updateTeacher: mocks.updateTeacher,
    deleteTeacher: mocks.deleteTeacher,
  },
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

/**
 * 添加教师's in-flight state.
 *
 * The dialog's submit button stayed enabled while the create request was running, so a double click
 * sent two creates and the operator ended up with two accounts (the second one answered
 * 「用户名已存在」, which reads as a password problem rather than as their own double click).
 */
describe('AdminTeachersPage', () => {
  let resolveCreate!: (value: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeachers.mockResolvedValue([]);
    mocks.createTeacher.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
  });

  it('disables 创建教师 while the request is in flight, so one click creates one account', async () => {
    render(<AdminTeachers />);
    await waitFor(() => expect(mocks.getTeachers).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '添加教师' }));
    fireEvent.change(await screen.findByLabelText('用户名'), { target: { value: 'teacher3' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw3' } });
    fireEvent.click(screen.getByRole('button', { name: '创建教师' }));

    await waitFor(() => expect(mocks.createTeacher).toHaveBeenCalledTimes(1));
    const pending = screen.getByRole('button', { name: '保存中...' });
    expect(pending).toBeDisabled();

    // The disabled attribute is what makes a second click a no-op.
    fireEvent.click(pending);
    expect(mocks.createTeacher).toHaveBeenCalledTimes(1);

    resolveCreate({ success: true, data: { id: 3, username: 'teacher3' } });
    await waitFor(() => expect(mocks.getTeachers).toHaveBeenCalledTimes(2));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('教师创建成功');
  });

  it('filters by username and shows each account’s activation state', async () => {
    mocks.getTeachers.mockResolvedValue([
      { id: 1, username: 'alice', role: 'teacher', isActivated: true },
      { id: 2, username: 'bob', role: 'teacher', isActivated: false },
    ]);

    render(<AdminTeachers />);

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getAllByText('已激活').length).toBeGreaterThan(0);
    expect(screen.getAllByText('待激活').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索教师用户名' }), {
      target: { value: 'bob' },
    });

    expect(screen.queryByText('alice')).not.toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });
});
