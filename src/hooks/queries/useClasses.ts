import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '@/api/teacher';

export interface ClassItem {
  id: number;
  name: string;
  invite_code: string;
}

export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const data = await teacherApi.getClasses() as any;
      return data.classes;
    },
  });
}
