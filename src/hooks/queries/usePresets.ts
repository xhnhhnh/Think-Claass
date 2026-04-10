import { useQuery } from '@tanstack/react-query';
import { teacherApi } from '@/api/teacher';

export interface Preset {
  id: number;
  label: string;
  amount: number;
}

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: async () => {
      const data = await teacherApi.getPresets() as any;
      return data.presets;
    },
  });
}
