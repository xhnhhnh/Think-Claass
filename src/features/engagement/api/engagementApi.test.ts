import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiDelete: mocks.apiDelete,
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { certificatesApi } from './certificatesApi';
import { announcementsApi } from './announcementsApi';
import { danmakuApi } from './danmakuApi';
import { familyTasksApi } from './familyTasksApi';
import { luckyDrawApi } from './luckyDrawApi';
import { messagesApi } from './messagesApi';
import { redemptionApi } from './redemptionApi';

describe('engagement feature APIs', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('uses typed message and family task paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, messages: [] });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });

    await messagesApi.getMessages(3, 'TREE_HOLE', { involvedId: 7 });
    await messagesApi.sendMessage({ class_id: 3, sender_id: 7, content: 'hi', is_anonymous: true, type: 'TREE_HOLE', sender_role: 'student' });
    await familyTasksApi.createTask({ student_id: 7, parent_id: 2, title: '阅读', points: 3 });
    await familyTasksApi.updateTaskStatus(9, 'approved');

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/messages?classId=3&type=TREE_HOLE&involvedId=7');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/messages', {
      class_id: 3,
      sender_id: 7,
      content: 'hi',
      is_anonymous: true,
      type: 'TREE_HOLE',
      sender_role: 'student',
    });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/family-tasks', { student_id: 7, parent_id: 2, title: '阅读', points: 3 });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/family-tasks/9', { status: 'approved' });
  });

  it('uses typed rewards and redemption paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });
    mocks.apiPost.mockResolvedValue({ success: true });

    await certificatesApi.getStudentCertificates(7);
    await certificatesApi.issueCertificate({ student_id: 7, title: '阅读之星' });
    await redemptionApi.verify({ code: 'ABC123', teacherId: 1 });
    await luckyDrawApi.draw(7);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/certificates?studentId=7');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/certificates', { student_id: 7, title: '阅读之星' });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/redemption/verify', { code: 'ABC123', teacherId: 1 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/lucky-draw/draw', { studentId: 7 });
  });

  it('uses announcement and danmaku paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    await announcementsApi.getActiveAnnouncement();
    await announcementsApi.getClassAnnouncements(3);
    await danmakuApi.getMessages(3, 9);
    await danmakuApi.sendMessage({ class_id: 3, sender_name: '小明', content: '加油', color: '#fff' });
    await danmakuApi.cleanup();

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/announcements/active');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/class-announcements?classId=3');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/danmaku?classId=3&since=9');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/danmaku', { class_id: 3, sender_name: '小明', content: '加油', color: '#fff' });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/danmaku/cleanup');
  });
});
