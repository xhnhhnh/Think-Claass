import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  AiStudyAssignPayload,
  AiStudyAssignResponse,
  AiStudyClassInsightResponse,
  AiStudyCurrentSetResponse,
  AiStudySetResponse,
  AiStudySubmitResponse,
} from '@thinkclass/contracts/domains/ai-study';

/**
 * AI 智学 - the practice-set engine's HTTP client.
 *
 * Every response is the `{ success: true, data }` envelope these routes actually answer (they are new,
 * so there is no legacy flattened shape to accommodate). The AI block lives beside the set rather than
 * inside it: `data.ai` describes the *generation* - including the case where there is no set at all,
 * which is what an empty question bank produces.
 */
export const aiStudyApi = {
  /** GET /api/ai-study/my/sets/current - the student's open set, or `set: null`. */
  currentMySet: () => apiGet<AiStudyCurrentSetResponse>('/api/ai-study/my/sets/current'),

  /**
   * POST /api/ai-study/my/sets - 生成今日智学.
   *
   * The explicit `timeout` is deliberate. The shared axios client gives up at 15 s, and the server
   * allows the model up to 8 s before falling back to the rule result - a default-timeout request
   * would be at risk of the browser abandoning a response the server is about to answer, which would
   * turn the graceful-degradation path this feature is built around into a network error.
   */
  generateMySet: (data: { subject_id?: number | null; size?: number; hint?: string | null } = {}) =>
    apiPost<AiStudySetResponse>('/api/ai-study/my/sets', data, { timeout: 20_000 }),

  /** PUT /api/ai-study/sets/:id/answers - save without submitting. */
  saveAnswers: (setId: number, answers: Array<{ item_id: number; value: string; spent_sec?: number }>) =>
    apiPut<AiStudySetResponse>(`/api/ai-study/sets/${setId}/answers`, { answers }),

  /** POST /api/ai-study/sets/:id/submit - judge every answer, then close the set. */
  submitSet: (setId: number) => apiPost<AiStudySubmitResponse>(`/api/ai-study/sets/${setId}/submit`, {}),

  /** GET /api/ai-study/classes/:classId/insight - the teacher's class board. */
  classInsight: (classId: number) =>
    apiGet<AiStudyClassInsightResponse>(`/api/ai-study/classes/${classId}/insight`),

  /** POST /api/ai-study/classes/:classId/assign - dispatch sets to the selected students. */
  assign: (classId: number, data: AiStudyAssignPayload) =>
    apiPost<AiStudyAssignResponse>(`/api/ai-study/classes/${classId}/assign`, data, { timeout: 20_000 }),
};

export type {
  AiStudyAssignPayload,
  AiStudyAssignResult,
  AiStudyClassInsight,
  AiStudyOutcome,
  AiStudySet,
  AiStudySetItem,
  AiStudySetResult,
  AiStudyStudentSuggestion,
  AiStudySubmitResult,
  AiStudyWeakNode,
} from '@thinkclass/contracts/domains/ai-study';
