import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentTasks from './Tasks';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useFamilyTasks: vi.fn(),
  useCreateFamilyTaskMutation: vi.fn(),
  useUpdateFamilyTaskStatusMutation: vi.fn(),
  useDeleteFamilyTaskMutation: vi.fn(),
  useRegisterPageCommands: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) =>
    selector({ user: { id: 9, role: 'parent', studentId: 6, name: '家长' } }),
}));

vi.mock('@/hooks/queries/useFamilyTasks', () => ({
  useFamilyTasks: mocks.useFamilyTasks,
  useCreateFamilyTaskMutation: mocks.useCreateFamilyTaskMutation,
  useUpdateFamilyTaskStatusMutation: mocks.useUpdateFamilyTaskStatusMutation,
  useDeleteFamilyTaskMutation: mocks.useDeleteFamilyTaskMutation,
}));

vi.mock('@/app/commands/registry', () => ({
  useRegisterPageCommands: mocks.useRegisterPageCommands,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

/**
 * 家庭时光's approve/reject row action.
 *
 * The two buttons write status and (on approval) the child's points. They used to stay enabled while
 * the write was in flight, so a double tap fired a second write whose refusal was reported as
 * 「网络错误」 even when the first call had already succeeded - and every real 400/403 was flattened
 * into the same network sentence as well.
 */
describe('ParentTasks', () => {
  const mutateStatus = vi.fn();

  const completedTask = {
    id: 41,
    title: '自己整理书包',
    points: 5,
    status: 'completed',
    created_at: '2026-10-01 08:00:00',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useFamilyTasks.mockReturnValue({
      data: [completedTask],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useCreateFamilyTaskMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useUpdateFamilyTaskStatusMutation.mockReturnValue({
      mutateAsync: mutateStatus,
      isPending: false,
    });
    mocks.useDeleteFamilyTaskMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('disables 真棒/再加油 while the status write is in flight', () => {
    mocks.useUpdateFamilyTaskStatusMutation.mockReturnValue({
      mutateAsync: mutateStatus,
      isPending: true,
    });

    render(<ParentTasks />);

    expect(screen.getByRole('button', { name: '真棒' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '再加油' })).toBeDisabled();
  });

  it('does not toast a generic 网络错误 when the approval is refused', async () => {
    mutateStatus.mockRejectedValue(new Error('该约定已处理'));

    render(<ParentTasks />);
    fireEvent.click(screen.getByRole('button', { name: '真棒' }));

    await waitFor(() => expect(mutateStatus).toHaveBeenCalledTimes(1));
    // The api layer owns the failure message; the page must not stack 「网络错误」 on top of it.
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
