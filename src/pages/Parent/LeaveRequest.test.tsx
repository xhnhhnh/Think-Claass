import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentLeaveRequest from './LeaveRequest';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useLeaves: vi.fn(),
  useCreateLeaveMutation: vi.fn(),
  useRegisterPageCommands: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) =>
    selector({ user: { id: 9, role: 'parent', studentId: 6, name: '家长' } }),
}));

vi.mock('@/features/classroom/hooks/useLeaves', () => ({
  useLeaves: mocks.useLeaves,
  useCreateLeaveMutation: mocks.useCreateLeaveMutation,
}));

vi.mock('@/app/commands/registry', () => ({
  useRegisterPageCommands: mocks.useRegisterPageCommands,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

/**
 * 请假假条's failed read.
 *
 * It used to be a red sentence with nothing to click: the only recovery was a full page reload, while
 * the same console's 家庭时光 and 家校信箱 both offered 重试.
 */
describe('ParentLeaveRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCreateLeaveMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('offers a retry on the error branch instead of dead-ending', () => {
    mocks.useLeaves.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('offline'),
      refetch: mocks.refetch,
    });

    render(<ParentLeaveRequest />);

    expect(screen.getByText('假条记录加载失败，请稍后重试。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
