import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherCommunication from '@/features/engagement/pages/TeacherCommunicationPage';

const mocks = vi.hoisted(() => ({
  getClasses: vi.fn(),
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  getClassAnnouncements: vi.fn(),
  createClassAnnouncement: vi.fn(),
  deleteClassAnnouncement: vi.fn(),
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

vi.mock('@/features/engagement/api/announcementsApi', () => ({
  announcementsApi: {
    getClassAnnouncements: mocks.getClassAnnouncements,
    createClassAnnouncement: mocks.createClassAnnouncement,
    deleteClassAnnouncement: mocks.deleteClassAnnouncement,
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
    mocks.getClassAnnouncements.mockReset();
    mocks.createClassAnnouncement.mockReset();
    mocks.deleteClassAnnouncement.mockReset();
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
    mocks.getClassAnnouncements.mockResolvedValue({ success: true, announcements: [] });
    mocks.createClassAnnouncement.mockResolvedValue({
      success: true,
      announcement: { id: 11, title: '明天带作业本', content: '别忘了', created_at: '' },
    });
    mocks.deleteClassAnnouncement.mockResolvedValue({ success: true });
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

  /**
   * 班级通知 - the write half of the pupil's 互动墙.
   *
   * `POST /api/class-announcements` (and its delete) had no caller in any console while the student
   * wall read the same list, so the notice board could never have a first entry.
   */
  it('publishes a class notice through POST /api/class-announcements', async () => {
    // Scoped to this render: the file mounts the page in every test, and a query that matched an
    // earlier mount would let one test's typed values decide another test's assertions.
    const { container } = render(<TeacherCommunication />);
    const page = within(container);

    fireEvent.change(await page.findByPlaceholderText('例如：明天带好数学作业本'), {
      target: { value: '明天带作业本' },
    });
    fireEvent.change(page.getByPlaceholderText('补充说明（时间、地点、需要准备什么）'), {
      target: { value: '别忘了' },
    });
    fireEvent.click(page.getByRole('button', { name: /发布通知/ }));

    await waitFor(() =>
      expect(mocks.createClassAnnouncement).toHaveBeenCalledWith({
        classId: 3,
        title: '明天带作业本',
        content: '别忘了',
      }),
    );
    // The list is re-read, so the teacher sees what the pupils will (once on mount, once after).
    expect(mocks.getClassAnnouncements.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通知已发布，学生打开互动墙就能看到');
  });

  it('refuses an empty notice instead of sending it', async () => {
    const { container } = render(<TeacherCommunication />);
    const page = within(container);
    await page.findByPlaceholderText('例如：明天带好数学作业本');

    fireEvent.click(page.getByRole('button', { name: /发布通知/ }));

    expect(mocks.toastError).toHaveBeenCalledWith('请填写通知标题和内容');
    expect(mocks.createClassAnnouncement).not.toHaveBeenCalled();
  });

  it('lists the notices already published and withdraws one by id', async () => {
    mocks.getClassAnnouncements.mockResolvedValue({
      success: true,
      announcements: [{ id: 8, title: '旧通知', content: '内容', created_at: '2026-03-01 00:00:00' }],
    });

    const { container } = render(<TeacherCommunication />);
    const page = within(container);

    expect(await page.findByText('旧通知')).toBeInTheDocument();
    fireEvent.click(page.getByRole('button', { name: '撤回通知 旧通知' }));

    await waitFor(() => expect(mocks.deleteClassAnnouncement).toHaveBeenCalledWith(8));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通知已撤回');
  });

  it('says the notice read failed instead of claiming the class has none', async () => {
    mocks.getClassAnnouncements.mockRejectedValueOnce(new Error('offline'));

    const { container } = render(<TeacherCommunication />);
    const page = within(container);

    expect(await page.findByText('已有通知没有加载出来')).toBeInTheDocument();
    expect(page.queryByText('这个班级还没有通知。')).not.toBeInTheDocument();
  });
});
