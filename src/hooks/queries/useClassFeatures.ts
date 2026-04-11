import { useQuery } from '@tanstack/react-query';

import { classFeaturesApi } from '@/api/classFeatures';
import { defaultClassFeatures } from '@/lib/classFeatures';

export function useClassFeatures(classId: number | null) {
  return useQuery({
    queryKey: ['class-features', classId],
    queryFn: async () => {
      if (!classId) {
        return {
          features: defaultClassFeatures,
          pet_selection_mode: 'random',
        };
      }
      const data = await classFeaturesApi.getFeatures(classId);
      return {
        features: data.features,
        pet_selection_mode: data.pet_selection_mode,
      };
    },
    enabled: !!classId,
  });
}
