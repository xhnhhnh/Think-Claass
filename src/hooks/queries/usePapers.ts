import { useQuery } from '@tanstack/react-query';

import { papersApi, type PaperDetail, type Paper } from '@/api/papers';

export function usePapers(classId?: number) {
  return useQuery({
    queryKey: ['papers', classId ?? null],
    queryFn: async () => {
      const data = await papersApi.list(classId);
      return data.data as Paper[];
    },
  });
}

export function usePaper(paperId: number | null) {
  return useQuery({
    queryKey: ['paper', paperId],
    queryFn: async () => {
      if (!paperId) return null as PaperDetail | null;
      const data = await papersApi.get(paperId);
      return data.data;
    },
    enabled: !!paperId,
  });
}

