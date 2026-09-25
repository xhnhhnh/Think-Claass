/**
 * `plugins/ai-study` (AI 智学) - one personalised practice set, and the teacher's class board.
 *
 * Every route answers the `{ success: true, data }` envelope, so each function below returns the
 * unwrapped payload. Two shapes are worth knowing before reading a page:
 *
 *   - `AiStudySetResult` is `{ set, ai }` and not a bare set. `set: null` is a *success* meaning
 *     "there is nothing to practise right now", and `ai` explains why (an empty question bank, an
 *     unconfigured model) - so a page renders `ai.message` instead of guessing.
 *   - `AiStudySetItem` carries the question, the reason it was chosen and the student's saved
 *     answer, so the whole set renders and resumes from one response.
 *
 * No reference answer and no explanation exist on these DTOs (the plugin documents why), so the
 * client cannot show the key even by accident.
 */

import { AI_REQUEST_TIMEOUT } from '../config/index'
import { get, post, put } from '../utils/request'

export interface AiStudyOutcome {
  source: string
  available: boolean
  confidence: number | null
  message: string
}

export interface AiStudyQuestionOption {
  id: string
  text: string
}

export interface AiStudyQuestion {
  id: number
  type: string
  stem: string
  options: AiStudyQuestionOption[]
  points: number
  difficulty: number | null
}

export interface AiStudySetItem {
  id: number
  question_id: number
  order_no: number
  /** Why this question is here, in the student's own language. */
  reason: string
  score: number
  factors: Record<string, number>
  ai_ranked: boolean
  question: AiStudyQuestion
  answer: { value: string; is_correct: boolean | null } | null
}

export interface AiStudySet {
  id: number
  student_id: number
  class_id: number | null
  subject_id: number | null
  /** `self` (the student generated it) or `assigned` (a teacher dispatched it). */
  source: string
  /** `open` or `done`. */
  status: string
  engine_version: number
  created_at: string
  updated_at: string
  items: AiStudySetItem[]
}

export interface AiStudySetResult {
  set: AiStudySet | null
  ai: AiStudyOutcome
}

export interface AiStudyAnsweredItem {
  item_id: number
  question_id: number
  /** `null` means nobody judged it - a subjective question, or no reference answer configured. */
  is_correct: boolean | null
  mastery_score: number | null
}

export interface AiStudySubmitResult {
  set_id: number
  total: number
  correct: number
  pending: number
  items: AiStudyAnsweredItem[]
  ai: AiStudyOutcome
}

export interface AiStudyWeakNode {
  node_id: number
  name: string
  importance: number | null
  wrong_count: number
  student_count: number
}

export interface AiStudyStudentSuggestion {
  student_id: number
  name: string
  top_node_id: number | null
  top_node_name: string | null
  wrong_count: number
  /** The set they already have open, so the board offers 查看 rather than a duplicate 派发. */
  open_set_id: number | null
  reason: string
}

export interface AiStudyClassInsight {
  class_id: number
  students_considered: number
  students_total: number
  weak_nodes: AiStudyWeakNode[]
  suggestions: AiStudyStudentSuggestion[]
  ai: AiStudyOutcome
}

export interface AiStudyAssignPayload {
  student_ids: number[]
  subject_id?: number | null
  size?: number
  hint?: string | null
}

export interface AiStudyAssignResult {
  class_id: number
  created: Array<{ student_id: number; set_id: number }>
  /** Per-student failures: one bad row must not void a whole dispatch. */
  failed: Array<{ student_id: number; reason: string }>
  ai: AiStudyOutcome
}

/** One saved answer, as `PUT /answers` expects it. */
export interface AiStudyAnswerInput {
  item_id: number
  value: string
  spent_sec?: number
}

interface DataEnvelope<T> {
  success: true
  data: T
}

/** GET /api/ai-study/my/sets/current - my open set, or `set: null`. */
export async function currentSet(): Promise<AiStudySetResult> {
  const body = await get<DataEnvelope<AiStudySetResult>>('/api/ai-study/my/sets/current')
  return body.data
}

/**
 * POST /api/ai-study/my/sets - 生成今日智学.
 *
 * The long timeout is not decoration: the server lets a model think for up to ~8s before falling
 * back to its rule engine, and the default 15s ceiling on a slow mobile network would abandon a
 * response the server was about to answer - turning the graceful-degradation path this feature is
 * built around into a network error.
 */
export async function generateSet(data: { subject_id?: number | null; size?: number; hint?: string | null } = {}): Promise<AiStudySetResult> {
  const body = await post<DataEnvelope<AiStudySetResult>>('/api/ai-study/my/sets', data, { timeout: AI_REQUEST_TIMEOUT })
  return body.data
}

/** PUT /api/ai-study/sets/:id/answers - save without submitting. */
export async function saveSetAnswers(setId: number, answers: AiStudyAnswerInput[]): Promise<AiStudySetResult> {
  const body = await put<DataEnvelope<AiStudySetResult>>(`/api/ai-study/sets/${setId}/answers`, { answers })
  return body.data
}

/** POST /api/ai-study/sets/:id/submit - judge every answer, then close the set. */
export async function submitSet(setId: number): Promise<AiStudySubmitResult> {
  const body = await post<DataEnvelope<AiStudySubmitResult>>(`/api/ai-study/sets/${setId}/submit`, {})
  return body.data
}

/** GET /api/ai-study/classes/:classId/insight - the teacher's board. */
export async function classInsight(classId: number): Promise<AiStudyClassInsight> {
  const body = await get<DataEnvelope<AiStudyClassInsight>>(`/api/ai-study/classes/${classId}/insight`)
  return body.data
}

/** POST /api/ai-study/classes/:classId/assign - dispatch sets to the selected students. */
export async function assignSets(classId: number, payload: AiStudyAssignPayload): Promise<AiStudyAssignResult> {
  const body = await post<DataEnvelope<AiStudyAssignResult>>(`/api/ai-study/classes/${classId}/assign`, payload, {
    timeout: AI_REQUEST_TIMEOUT,
  })
  return body.data
}
