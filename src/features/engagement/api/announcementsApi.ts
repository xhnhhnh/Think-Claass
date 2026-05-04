import { apiGet } from '@/lib/api';

export interface ClassAnnouncement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

export const announcementsApi = {
  getClassAnnouncements: (classId: number) =>
    apiGet<{ success: true; announcements: ClassAnnouncement[] }>(`/api/class-announcements?classId=${classId}`),
};
