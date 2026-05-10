import { apiGet } from '@/lib/api';
import type { PublicAnnouncementDto } from '@/shared/engagement/contracts';

export interface ClassAnnouncement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

export const announcementsApi = {
  getActiveAnnouncement: () =>
    apiGet<{ success: true; announcement?: PublicAnnouncementDto | null }>('/api/announcements/active'),

  getClassAnnouncements: (classId: number) =>
    apiGet<{ success: true; announcements: ClassAnnouncement[] }>(`/api/class-announcements?classId=${classId}`),
};
