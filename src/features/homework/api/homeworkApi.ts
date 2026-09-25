import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  HomeworkAiGeneratePayload,
  HomeworkAiGenerateResult,
  HomeworkAiGradePayload,
  HomeworkAiGradeResult,
  HomeworkAttemptDetail,
  HomeworkAttemptResponse,
  HomeworkDetail,
  HomeworkDetailResponse,
  HomeworkGradePayload,
  HomeworkGradeSheetResponse,
  HomeworkListResponse,
  HomeworkPhoto,
  HomeworkPublishPayload,
  HomeworkQaAskPayload,
  HomeworkQaResponse,
  HomeworkQaResult,
  HomeworkSaveAnswersPayload,
  HomeworkStudentListResponse,
  HomeworkSubmitPayload,
  HomeworkUpdatePayload,
} from '@thinkclass/contracts/domains/homework';

/**
 * homeworkApi - the frontend client for `plugins/homework`.
 *
 * The route list is `plugins/homework/plugin.json`, verbatim: paths and methods are copied
 * from the manifest rather than remembered, because the manifest is what the kernel
 * registers. Every one of these returns the bare `{ success: true, data }` envelope
 * (`_envelope_note` in the manifest) - **no** flattened duplicate keys - and `src/lib/api`
 * hands back the whole envelope, so callers unwrap `.data` themselves.
 *
 * Nothing here unwraps for the caller. The predecessor `assignmentsApi` returns the raw
 * envelope and every hook does `(await api.x()).data`; keeping that shape means a reader who
 * knows one feature tree knows the other, and it keeps `showError` (the api layer's own
 * toast) available at call sites that want it.
 *
 * `uploadPhoto` takes a `FormData` the caller built: the browser has to set the multipart
 * boundary itself, so the body is never a plain object here.
 */
export const homeworkApi = {
  /** GET /api/homework - the teacher's own homework (rows carrying their `teacher_id`). */
  list: () => apiGet<HomeworkListResponse>('/api/homework'),

  /**
   * GET /api/homework/my - the signed-in student's homework, each entry carrying their own
   * submission if there is one. `data: HomeworkStudentEntry[]`.
   */
  listMine: () => apiGet<HomeworkStudentListResponse>('/api/homework/my'),

  /** GET /api/homework/:id - one homework with its questions, in `order_no` order. */
  detail: (id: number) => apiGet<HomeworkDetailResponse>(`/api/homework/${id}`),

  /**
   * POST /api/homework - publish. `class_id` is required; the service derives `teacher_id`
   * from the actor and discards any copy in the body.
   */
  create: (payload: HomeworkPublishPayload) =>
    apiPost<{ success: true; data: HomeworkDetail }>('/api/homework', payload),

  /**
   * PUT /api/homework/:id - edit. `questions` present replaces the question list (existing
   * ids updated, new ones inserted, the rest deleted); omitted leaves questions untouched.
   */
  update: (id: number, payload: HomeworkUpdatePayload) =>
    apiPut<{ success: true; data: HomeworkDetail }>(`/api/homework/${id}`, payload),

  /** DELETE /api/homework/:id - removes the homework and its cascade. */
  remove: (id: number) => apiDelete<{ success: true; data: { deleted: true } }>(`/api/homework/${id}`),

  /** GET /api/homework/:id/submissions - the grade sheet: submissions with student names. */
  listSubmissions: (id: number) => apiGet<HomeworkGradeSheetResponse>(`/api/homework/${id}/submissions`),

  /**
   * POST /api/homework/:id/ai-grade - the AI assist.
   *
   * `overwrite_teacher` defaults to false **on the server**, and the UI mirrors that: a batch
   * run must not silently undo a teacher's decision, so the page only sends `true` behind an
   * explicit confirmation. The outcome is carried inside the 200 body rather than thrown, so
   * an unconfigured provider still means "the write succeeded, the AI half did not".
   */
  aiGrade: (id: number, payload: HomeworkAiGradePayload) =>
    apiPost<{ success: true; data: HomeworkAiGradeResult }>(`/api/homework/${id}/ai-grade`, payload),

  /**
   * POST /api/homework/ai/questions - 出题.
   *
   * The only route in this client with no id, because generation touches no row: the teacher presses
   * it inside the publish dialog (no homework yet) or the edit dialog (one already), and the
   * candidates come back to be inserted into the form they are editing. `data.skipped` counts the
   * candidates the model offered that could not be used, so the panel can report the loss honestly
   * instead of quietly returning fewer questions than were asked for.
   */
  generateQuestions: (payload: HomeworkAiGeneratePayload) =>
    apiPost<{ success: true; data: HomeworkAiGenerateResult }>('/api/homework/ai/questions', payload),

  /**
   * GET /api/homework/:id/qa - the thread between one student and the assistant.
   *
   * `studentId` is only meaningful for staff: a student or parent is pinned to their own resolved
   * student row by the backend and a query naming someone else is refused outright, so the attempt
   * page omits it. A teacher *must* name one - a thread belongs to a pupil, and the route answers 400
   * without it - which is what makes `useTeacherHomeworkQa` a separate hook rather than an optional
   * argument everyone passes.
   */
  listQa: (id: number, studentId?: number) =>
    apiGet<HomeworkQaResponse>(
      studentId === undefined ? `/api/homework/${id}/qa` : `/api/homework/${id}/qa?student_id=${studentId}`,
    ),

  /** POST /api/homework/:id/qa - ask, and get the thread back with the answer appended. */
  askQa: (id: number, payload: HomeworkQaAskPayload) =>
    apiPost<{ success: true; data: HomeworkQaResult }>(`/api/homework/${id}/qa`, payload),

  /**
   * POST /api/homework/:id/attempt - start or resume my attempt.
   *
   * Idempotent by design: the student page calls it on mount, and it answers the existing
   * submission when there is one (`data: HomeworkAttemptDetail`). It is a POST because it may
   * create the `draft` row, which is why an attempt page has no GET fallback.
   */
  startAttempt: (id: number) => apiPost<HomeworkAttemptResponse>(`/api/homework/${id}/attempt`),

  /** GET /api/homework/submissions/:id - one submission with its answers and photos. */
  getSubmission: (id: number) => apiGet<HomeworkAttemptResponse>(`/api/homework/submissions/${id}`),

  /**
   * PUT /api/homework/submissions/:id - the teacher's write: per-answer `teacher_score` /
   * `teacher_comment`, whole-paper `teacher_feedback`, and the status that publishes it
   * (`graded`) or sends it back to fix (`returned`).
   */
  gradeSubmission: (id: number, payload: HomeworkGradePayload) =>
    apiPut<{ success: true; data: HomeworkAttemptDetail }>(`/api/homework/submissions/${id}`, payload),

  /** PUT /api/homework/submissions/:id/answers - the student's auto-save. */
  saveAnswers: (id: number, payload: HomeworkSaveAnswersPayload) =>
    apiPut<{ success: true; data: HomeworkAttemptDetail }>(`/api/homework/submissions/${id}/answers`, payload),

  /**
   * POST /api/homework/submissions/:id/photos - one photo, multipart.
   *
   * A photo belongs to the *submission*: `HomeworkPhoto` has no `question_id`, and a
   * question-scoped photo is recorded by that answer's `HomeworkAnswerValue.photo_ids`. The
   * caller therefore attaches the returned photo id to the question's answer and saves that
   * answer, rather than sending a scope the route does not have.
   */
  uploadPhoto: (id: number, formData: FormData) =>
    apiPost<{ success: true; data: HomeworkPhoto }>(`/api/homework/submissions/${id}/photos`, formData),

  /** POST /api/homework/submissions/:id/submit - hand it in. */
  submitAttempt: (id: number, payload: HomeworkSubmitPayload) =>
    apiPost<{ success: true; data: HomeworkAttemptDetail }>(`/api/homework/submissions/${id}/submit`, payload),
};

export type { Homework, HomeworkDetail, HomeworkQuestion } from '@thinkclass/contracts/domains/homework';
