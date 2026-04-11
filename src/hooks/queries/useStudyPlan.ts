import { useQuery } from '@tanstack/react-query';

import { studyPlansApi, type StudyPlan } from '@/api/studyPlans';

export function useStudyPlan() {
  return useQuery({
    queryKey: ['study-plan', 'my'],
    queryFn: async () => {
      const data = await studyPlansApi.my();
      return data.data as StudyPlan | null;
    },
  });
}

