import { apiGet, apiPost } from '@/lib/api';
import type { Question } from '@/api/papers';

export interface WrongQuestion {
  id: number;
  student_id: number;
  question_id: number;
  first_wrong_at: string | null;
  last_wrong_at: string | null;
  wrong_count: number;
  mastery_score: number | null;
  cleared_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  questions: Question;
}

export const wrongQuestionsApi = {
  my: () => apiGet<{ success: true; data: WrongQuestion[] }>('/api/wrong-questions/my'),
  attempt: (wrongQuestionId: number, data: { is_correct: 0 | 1; spent_sec?: number; practice_source?: string }) =>
    apiPost<{ success: true }>(`/api/wrong-questions/${wrongQuestionId}/attempt`, data),
  generate: (wrongQuestionId: number) => apiPost<{ success: true; data: Question[] }>(`/api/wrong-questions/${wrongQuestionId}/generate`, {}),
};

