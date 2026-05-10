import { useQuery } from '@tanstack/react-query';

import { settingsApi } from '../api/settingsApi';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const data = await settingsApi.getSettings();
      return data.data;
    },
  });
}
