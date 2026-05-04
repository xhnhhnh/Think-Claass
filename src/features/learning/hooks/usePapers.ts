import { useQuery } from '@tanstack/react-query';
import { papersApi, type Paper, type PaperDetail } from '../api/papersApi';

export const paperKeys = {
  list: (classId?: number | null) => ['papers', classId ?? null] as const,
  detail: (paperId: number | null) => ['paper', paperId] as const,
};

export function usePapers(classId?: number) {
  return useQuery({
    queryKey: paperKeys.list(classId ?? null),
    queryFn: async () => (await papersApi.list(classId)).data as Paper[],
  });
}

export function usePaper(paperId: number | null) {
  return useQuery({
    queryKey: paperKeys.detail(paperId),
    queryFn: async () => {
      if (!paperId) return null as PaperDetail | null;
      return (await papersApi.get(paperId)).data;
    },
    enabled: !!paperId,
  });
}
