import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '@/api/teacher';

export interface Group {
  id: number;
  name: string;
}

export function useGroups(classId: number | null) {
  return useQuery({
    queryKey: ['groups', classId],
    queryFn: async () => {
      if (!classId) return [];
      const data = await teacherApi.getGroups(classId) as any;
      return data.groups;
    },
    enabled: !!classId,
  });
}
