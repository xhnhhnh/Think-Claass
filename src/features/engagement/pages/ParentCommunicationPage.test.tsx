import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentCommunication from '@/features/engagement/pages/ParentCommunicationPage';

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

  /**
   * The initialisation window.
   *
   * The letters query is disabled until the child's class is known, so its `isLoading` is false while
   * the class lookup is in flight. Without treating init as loading the page painted
   * 「信箱空空如也」 from a request that had not started, and the composer looked usable while
   * `handleSend` silently returned because `classId` was still null.
   */
  it('shows the initialising state and disables the composer until the class is known', async () => {
    let resolveClass!: (value: unknown) => void;
    mocks.getStudentById.mockReturnValue(
      new Promise((resolve) => {
        resolveClass = resolve;
      }),
    );

    render(<ParentCommunication />);

    expect(screen.getByText('正在打开信箱...')).toBeInTheDocument();
    expect(screen.queryByText('信箱空空如也，写下第一封信吧')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('写下想对老师说的话...')).toBeDisabled();
    expect(screen.getByRole('button', { name: '寄出信件' })).toBeDisabled();

    resolveClass({ success: true, student: { id: 12, class_id: 3 } });

    // With the class known, the empty thread can finally be stated honestly.
    expect(await screen.findByText('信箱空空如也，写下第一封信吧')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('写下想对老师说的话...')).toBeEnabled();
  });

  it('does not add a 寄信失败 toast when the api layer already reported the refusal', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('当前账号无权访问该功能'));

    render(<ParentCommunication />);
    const textarea = await screen.findByPlaceholderText('写下想对老师说的话...');
    await waitFor(() => expect(textarea).toBeEnabled());

    fireEvent.change(textarea, { target: { value: '想了解孩子今天的表现' } });
    fireEvent.submit(textarea.closest('form')!);

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    // The api layer owns the message; the page must not replace it with 「寄信失败，请重试」.
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
