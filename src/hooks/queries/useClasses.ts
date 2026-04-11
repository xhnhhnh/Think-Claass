import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '@/api/teacher';
import { useStore } from '@/store/useStore';

export interface ClassItem {
  id: number;
  name: string;
  invite_code: string;
}

export function useClasses() {
  const user = useStore((state) => state.user);
  return useQuery({
    queryKey: ['classes', user?.id, user?.role],
    queryFn: async () => {
      const teacherId = user?.role === 'teacher' ? user.id : undefined;
      const data = await teacherApi.getClasses(teacherId) as any;
      return data.classes;
    },
  });
}
