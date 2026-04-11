import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '@/api/teacher';
import { useStore } from '@/store/useStore';

export interface Preset {
  id: number;
  label: string;
  amount: number;
}

export function usePresets() {
  const user = useStore((state) => state.user);
  return useQuery({
    queryKey: ['presets', user?.id, user?.role],
    queryFn: async () => {
      const teacherId = user?.role === 'teacher' ? user.id : undefined;
      const data = await teacherApi.getPresets(teacherId) as any;
      return data.presets;
    },
  });
}
