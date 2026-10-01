import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { PublicAnnouncementDto } from '@thinkclass/contracts/domains/engagement';

export interface ClassAnnouncement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

/**
 * 班级通知 - read on the student wall, written from 家校沟通.
 *
 * `POST /api/class-announcements` and `DELETE /api/class-announcements/:id` existed, were authorized
 * for a class's own teacher, were tested - and had no caller in any console, while the pupil's 互动墙
 * read the list and rendered 「暂无通知」 for ever. The teacher_id is the actor's (the body's is
 * ignored), so the two writes need nothing but `{ class_id, title, content }`.
 */
export const announcementsApi = {
  getActiveAnnouncement: () =>
    apiGet<{ success: true; announcement?: PublicAnnouncementDto | null }>('/api/announcements/active'),

  getClassAnnouncements: (classId: number) =>
    apiGet<{ success: true; announcements: ClassAnnouncement[] }>(`/api/class-announcements?classId=${classId}`),

  createClassAnnouncement: (input: { classId: number; title: string; content: string }) =>
    apiPost<{ success: true; announcement: ClassAnnouncement }>('/api/class-announcements', {
      class_id: input.classId,
      title: input.title,
      content: input.content,
    }),

  deleteClassAnnouncement: (id: number) => apiDelete<{ success: true }>(`/api/class-announcements/${id}`),
};
