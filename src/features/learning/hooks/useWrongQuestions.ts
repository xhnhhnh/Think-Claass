import { useQuery } from '@tanstack/react-query';
import { wrongQuestionsApi, type WrongQuestion } from '../api/wrongQuestionsApi';

export function useWrongQuestions() {
  return useQuery({
    queryKey: ['wrong-questions', 'my'],
    queryFn: async () => (await wrongQuestionsApi.my()).data as WrongQuestion[],
  });
}
