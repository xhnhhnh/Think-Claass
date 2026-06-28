import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentCommunication from './Communication';

const mocks = vi.hoisted(() => ({
  getStudentById: vi.fn(),
  useMessages: vi.fn(),
  useSendMessageMutation: vi.fn(),
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  user: {
    id: 31,
    role: 'parent',
    studentId: 12,
  },
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: {
    getStudentById: mocks.getStudentById,
  },
}));

vi.mock('@/hooks/queries/useMessages', () => ({
  useMessages: mocks.useMessages,
  useSendMessageMutation: mocks.useSendMessageMutation,
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: { user: typeof mocks.user }) => unknown) =>
    selector({
      user: mocks.user,
    }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('ParentCommunication', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mocks.getStudentById.mockReset();
    mocks.useMessages.mockReset();
    mocks.useSendMessageMutation.mockReset();
    mocks.mutateAsync.mockReset();
    mocks.refetch.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    mocks.getStudentById.mockResolvedValue({
      success: true,
      student: {
        id: 12,
        class_id: 3,
      },
    });
    mocks.useMessages.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: mocks.refetch,
    });
    mocks.useSendMessageMutation.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    });
    mocks.mutateAsync.mockResolvedValue({ success: true });
    mocks.refetch.mockResolvedValue(undefined);
  });

  it('sends home-school letters as a parent sender', async () => {
    render(<ParentCommunication />);

    fireEvent.change(screen.getByPlaceholderText('写下想对老师说的话...'), {
      target: { value: '请问作业需要签字吗？' },
    });
    await waitFor(() => expect(mocks.getStudentById).toHaveBeenCalledWith(12));
    fireEvent.submit(screen.getByPlaceholderText('写下想对老师说的话...').closest('form')!);

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        class_id: 3,
        sender_id: 31,
        content: '请问作业需要签字吗？',
        is_anonymous: false,
        type: 'HOME_SCHOOL',
        sender_role: 'parent',
      });
    });
  });
});
