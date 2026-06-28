import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherCommunication from './Communication';

const mocks = vi.hoisted(() => ({
  getClasses: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  user: {
    id: 7,
    role: 'teacher',
    username: 'teacher7',
  },
}));

vi.mock('@/features/classroom/api/classesApi', () => ({
  classroomApi: {
    getClasses: mocks.getClasses,
  },
}));

vi.mock('@/features/engagement/api/messagesApi', () => ({
  messagesApi: {
    getMessages: mocks.getMessages,
    sendMessage: mocks.sendMessage,
  },
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

describe('TeacherCommunication', () => {
  beforeEach(() => {
    mocks.getClasses.mockReset();
    mocks.getMessages.mockReset();
    mocks.sendMessage.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    mocks.getClasses.mockResolvedValue({
      success: true,
      classes: [{ id: 3, name: '一班' }],
    });
    mocks.getMessages.mockResolvedValue({
      success: true,
      messages: [
        {
          id: 88,
          class_id: 3,
          sender_id: 31,
          receiver_id: null,
          content: '请问作业需要签字吗？',
          type: 'HOME_SCHOOL',
          is_anonymous: 0,
          sender_role: 'parent',
          sender_name: '家长31',
          created_at: '2026-05-24T08:00:00.000Z',
        },
      ],
    });
    mocks.sendMessage.mockResolvedValue({ success: true });
  });

  it('replies to parent messages as a teacher sender', async () => {
    render(<TeacherCommunication />);

    expect(await screen.findByText('请问作业需要签字吗？')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '回复' }));
    fireEvent.change(screen.getByPlaceholderText('回复 家长31...'), {
      target: { value: '需要签字，明天带回。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith({
        class_id: 3,
        sender_id: 7,
        receiver_id: 31,
        content: '需要签字，明天带回。',
        type: 'HOME_SCHOOL',
        sender_role: 'teacher',
        is_anonymous: false,
      });
    });
  });
});
