/**
 * `plugins/homework` - the student half of the wire contract.
 *
 * ## The envelope is nested here
 *
 * Unlike the WeChat endpoints (which answer a bare payload), every `/api/homework` route answers
 * the legacy `{ success: true, data: ... }` envelope. `utils/request.ts` already treats
 * `success: false` as a failure, so what is left is the unwrap - and it happens here, once, so no
 * page ever writes `.data.data`.
 *
 * ## Answering a paper
 *
 * `POST /api/homework/:id/attempt` is the *only* way to open a paper: it is a POST because it may
 * create the `draft` submission row, and it is idempotent, answering the existing attempt when
 * there is one. There is deliberately no GET fallback, matching the web client.
 *
 * Answers are saved as a whole array keyed by `question_id` (`HomeworkAnswerInput`), which is what
 * an auto-save produces: the student's local draft is the source of truth while they type, and the
 * server is told the current state of every answer they have touched.
 */

import { get, post, put } from '../utils/request'

export type HomeworkQuestionType = 'single' | 'multiple' | 'blank' | 'short'
export type HomeworkStatus = 'draft' | 'published' | 'closed'
export type HomeworkSubmissionStatus = 'draft' | 'submitted' | 'graded' | 'returned'

export interface HomeworkOption {
  id: string
  text: string
}

export interface HomeworkQuestion {
  id: number
  assignment_id: number
  order_no: number
  type: HomeworkQuestionType
  stem: string
  options: HomeworkOption[]
  /** Not rendered before grading: the student never receives the answer key. */
  reference?: unknown
  explanation?: string | null
  points: number
}

export interface Homework {
  id: number
  class_id: number
  teacher_id: number
  title: string
  description: string | null
  due_at: string | null
  status: HomeworkStatus
  total_points: number
  reward_points: number
  /** Set on rows bridged from the deprecated `assignments` table: no questions, not gradable. */
  legacy?: boolean
  created_at?: string | null
}

export interface HomeworkDetail extends Homework {
  questions: HomeworkQuestion[]
}

export interface HomeworkSubmission {
  id: number
  assignment_id: number
  student_id: number
  status: HomeworkSubmissionStatus
  submitted_at: string | null
  score: number | null
  total_points: number
  teacher_feedback: string | null
  ai_feedback: string | null
  ai_confidence: number | null
  graded_by: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface HomeworkAnswerValue {
  choice?: string[]
  text?: string
  photo_ids?: number[]
}

export interface HomeworkAnswer {
  id: number
  submission_id: number
  question_id: number
  value: HomeworkAnswerValue
  score: number | null
  is_correct: number | null
  auto_score: number | null
  ai_score: number | null
  ai_comment: string | null
  teacher_score: number | null
  teacher_comment: string | null
}

export interface HomeworkAttemptDetail {
  homework: HomeworkDetail
  submission: HomeworkSubmission
  answers: HomeworkAnswer[]
  photos: Array<{ id: number; storage_path: string; mime: string }>
}

/** One row of a student's list: the homework plus *their* attempt, if any. */
export interface HomeworkStudentEntry {
  homework: Homework
  submission: HomeworkSubmission | null
  question_count: number
}

/** A teacher's row: the homework plus how many questions it holds. */
export interface HomeworkListEntry extends Homework {
  question_count: number
}

export interface HomeworkGradeRow {
  submission: HomeworkSubmission
  student_name: string
}

export interface HomeworkAnswerInput {
  question_id: number
  value: HomeworkAnswerValue
}

export interface HomeworkPublishPayload {
  class_id: number
  title: string
  description?: string | null
  due_at?: string | null
  status?: HomeworkStatus
  reward_points?: number
}

// ---------------------------------------------------------------------------
// Routes

interface DataEnvelope<T> {
  success: true
  data: T
}

/** GET /api/homework/my - my homework, each entry carrying my own attempt. */
export async function myHomework(): Promise<HomeworkStudentEntry[]> {
  const body = await get<DataEnvelope<HomeworkStudentEntry[]>>('/api/homework/my')
  return body.data || []
}

/** GET /api/homework/:id - one paper with its questions, in `order_no` order. */
export async function homeworkDetail(id: number): Promise<HomeworkDetail> {
  const body = await get<DataEnvelope<HomeworkDetail>>(`/api/homework/${id}`)
  return body.data
}

/** POST /api/homework/:id/attempt - open or resume my attempt. */
export async function startAttempt(id: number): Promise<HomeworkAttemptDetail> {
  const body = await post<DataEnvelope<HomeworkAttemptDetail>>(`/api/homework/${id}/attempt`)
  return body.data
}

/** PUT /api/homework/submissions/:id/answers - auto-save, without submitting. */
export async function saveAnswers(submissionId: number, answers: HomeworkAnswerInput[]): Promise<HomeworkAttemptDetail> {
  const body = await put<DataEnvelope<HomeworkAttemptDetail>>(`/api/homework/submissions/${submissionId}/answers`, { answers })
  return body.data
}

/** POST /api/homework/submissions/:id/submit - hand it in. */
export async function submitAttempt(submissionId: number, answers: HomeworkAnswerInput[]): Promise<HomeworkAttemptDetail> {
  const body = await post<DataEnvelope<HomeworkAttemptDetail>>(`/api/homework/submissions/${submissionId}/submit`, { answers })
  return body.data
}
