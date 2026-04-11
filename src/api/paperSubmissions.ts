import { apiPost, apiPut } from '@/lib/api';
import type { PaperItem } from '@/api/papers';

export interface PaperSubmission {
  id: number;
  paper_id: number;
  student_id: number;
  started_at: string | null;
  submitted_at: string | null;
  total_time_sec: number | null;
  created_at: string | null;
}

export const paperSubmissionsApi = {
  start: (paperId: number) =>
    apiPost<{ success: true; data: { submission: PaperSubmission; items: PaperItem[] } }>(
      '/api/paper-submissions/start',
      { paper_id: paperId },
    ),
  saveAnswers: (
    submissionId: number,
    answers: Array<{ paper_item_id: number; answer_json: string | null; time_spent_sec?: number | null }>,
  ) => apiPut<{ success: true }>(`/api/paper-submissions/${submissionId}/answers`, { answers }),
  submit: (submissionId: number) =>
    apiPost<{ success: true; data: { paper_id: number; submission_id: number; total_score: number; correct_count: number; wrong_count: number } }>(
      `/api/paper-submissions/${submissionId}/submit`,
      {},
    ),
};

