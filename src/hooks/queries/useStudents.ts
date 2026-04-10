import { useQuery } from '@tanstack/react-query';
import { studentsApi } from '@/api/students';

export interface Student {
  id: number;
  user_id: number;
  class_id: number;
  username: string;
  name: string;
  total_points: number;
  available_points: number;
  group_id?: number;
  group_name?: string;
}

export function useStudents(classId: number | null) {
  return useQuery({
    queryKey: ['students', classId],
    queryFn: async () => {
      if (!classId) return [];
      const data = await studentsApi.getStudents(classId) as any;
      return data.students;
    },
    enabled: !!classId,
  });
}
