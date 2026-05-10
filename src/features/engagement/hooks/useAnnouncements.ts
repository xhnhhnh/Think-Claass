import { useQuery } from '@tanstack/react-query';

import { announcementsApi } from '../api/announcementsApi';

export function useActiveAnnouncement() {
  return useQuery({
    queryKey: ['active-announcement'],
    queryFn: async () => {
      const response = await announcementsApi.getActiveAnnouncement();
      return response.announcement ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
