import { apiGet, apiPost } from '@/lib/api';
import type { Question, WrongQuestion } from '@/shared/learning/contracts';

export const wrongQuestionsApi = {
  my: () => apiGet<{ success: true; data: WrongQuestion[] }>('/api/wrong-questions/my'),
  attempt: (wrongQuestionId: number, data: { is_correct: 0 | 1; spent_sec?: number; practice_source?: string }) =>
    apiPost<{ success: true }>(`/api/wrong-questions/${wrongQuestionId}/attempt`, data),
  generate: (wrongQuestionId: number) => apiPost<{ success: true; data: Question[] }>(`/api/wrong-questions/${wrongQuestionId}/generate`, {}),
};

export type { WrongQuestion };
