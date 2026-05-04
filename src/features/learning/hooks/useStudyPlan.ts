import { useQuery } from '@tanstack/react-query';
import { studyPlansApi, type StudyPlan } from '../api/studyPlansApi';

export function useStudyPlan() {
  return useQuery({
    queryKey: ['study-plan', 'my'],
    queryFn: async () => (await studyPlansApi.my()).data as StudyPlan | null,
  });
}
