import { useQuery } from '@tanstack/react-query';

import { wrongQuestionsApi, type WrongQuestion } from '@/api/wrongQuestions';

export function useWrongQuestions() {
  return useQuery({
    queryKey: ['wrong-questions', 'my'],
    queryFn: async () => {
      const data = await wrongQuestionsApi.my();
      return data.data as WrongQuestion[];
    },
  });
}

