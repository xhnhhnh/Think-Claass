/**
 * homework domain contracts.
 *
 * The new homework system: a teacher publishes an assignment made of interactive questions,
 * a student answers them (or photographs their paper), the teacher grades it. AI grading and
 * AI question-answering hang off the same rows.
 *
 * ## Why this is a separate domain from `learning`
 *
 * `learning.ts` carries the legacy `Assignment` / `StudentAssignment` shape - one text box and
 * one score - plus the paper/question engine. This file carries the replacement: a real
 * question model, per-question grading (AI and teacher kept apart), photo evidence and an
 * AI Q&A thread. The two coexist only while `plugins/assignments` is deprecated; nothing new
 * should be written against that file.
 *
 * ## The three-field rule that this model exists for
 *
 * A question answer carries `score` (what counts), `ai_score` / `ai_comment` / `ai_confidence`
 * (what the model proposed) and `teacher_score` / `teacher_comment` (what the human decided).
 * They are separate columns rather than one overwritten value because "AI graded this and the
 * teacher accepted it" and "AI graded this and the teacher overrode it" are different facts,
 * and the second one is the signal that tells you whether the model is worth trusting.
 * `score` is always *derived*: the teacher's number when there is one, otherwise the AI's.
 *
 * Type-only by design and enforced by guardrail G6: this package must never gain a runtime
 * export. Envelope types are imported from `../http.js`.
 */

import type { ApiSuccess } from '../http.js';

/** How a question expects to be answered - also how it is graded. */
export type HomeworkQuestionType = 'single' | 'multiple' | 'blank' | 'short';

/**
 * The objectively gradable subset.
 *
 * A `short` question is the only one whose correctness needs judgement, which is exactly the
 * set the AI grader and the teacher's rubric are for. A type rather than an array because
 * guardrail G6 keeps this package type-only: the runtime list belongs with the grader, and
 * `plugins/homework/src/homework.grading.ts` is where it lives.
 */
export type HomeworkObjectiveQuestionType = Exclude<HomeworkQuestionType, 'short'>;

/** `draft` is invisible to students; `closed` refuses new submissions but keeps existing ones. */
export type HomeworkStatus = 'draft' | 'published' | 'closed';

/** `returned` is "give it back to fix"; it is the only status a student can submit again from. */
export type HomeworkSubmissionStatus = 'draft' | 'submitted' | 'graded' | 'returned';

/** A single selectable option of a choice question. `id` is what an answer refers to. */
export interface HomeworkOption {
  id: string;
  text: string;
}

/** One rubric line: a thing the answer should contain, and what it is worth. */
export interface HomeworkRubricEntry {
  label: string;
  points: number;
}

/**
 * The reference answer, stored as JSON in `p_homework_questions.answer_json`.
 *
 * The shape is deliberately loose (`string | string[]`) rather than five separate unions: the
 * question type decides how it is read, exactly as `plugins/learning` reads
 * `questions.answer_json`, and a stricter type here would have to be narrowed at every call
 * site anyway. `accept` is the list of strings a `blank` question treats as correct.
 */
export interface HomeworkReferenceAnswer {
  /** Choice questions: the option ids. `single` has exactly one, `multiple` one or more. */
  choice?: string[];
  /** Blank questions: every spelling accepted as correct. */
  accept?: string[];
  /** Short questions: the model answer a human or the AI grader compares against. */
  text?: string;
}

/** A student's answer to one question, stored as JSON in `p_homework_answers.answer_json`. */
export interface HomeworkAnswerValue {
  choice?: string[];
  text?: string;
  /** Blob keys in `p_homework_photos` the student attached to this specific question. */
  photo_ids?: number[];
}

// ---------------------------------------------------------------------------
// Rows

export interface Homework {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  status: HomeworkStatus;
  total_points: number;
  reward_points: number;
  /**
   * True when this row was read out of the deprecated `assignments` table rather than
   * `p_homework_assignments`.
   *
   * The read bridge below exists so that switching the frontend over cannot hide a deployment's
   * existing homework before the one-shot data migration has run. Bridged rows have no questions,
   * cannot be edited through the new routes and are not gradable - so the UI must hide those
   * actions when this flag is set instead of offering a button that answers 404. Absent (not
   * `false`) on rows that came from the new table.
   */
  legacy?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HomeworkQuestion {
  id: number;
  assignment_id: number;
  order_no: number;
  type: HomeworkQuestionType;
  stem: string;
  options: HomeworkOption[];
  reference: HomeworkReferenceAnswer;
  explanation: string | null;
  points: number;
  created_at?: string | null;
}

export interface HomeworkSubmission {
  id: number;
  assignment_id: number;
  student_id: number;
  status: HomeworkSubmissionStatus;
  submitted_at: string | null;
  score: number | null;
  total_points: number;
  teacher_feedback: string | null;
  /** The model's whole-paper remark, when AI grading ran. */
  ai_feedback: string | null;
  ai_confidence: number | null;
  /** `teacher` | `ai` | `ai+teacher` - who produced `score`. */
  graded_by: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HomeworkAnswer {
  id: number;
  submission_id: number;
  question_id: number;
  value: HomeworkAnswerValue;
  /** The effective score: `teacher_score`, else `ai_score`, else `auto_score`. */
  score: number | null;
  is_correct: number | null;
  /**
   * The deterministic grader's score and its provenance (`auto`).
   *
   * Kept apart from `ai_score` because they are claims from different sources: this one is the
   * server's own grader, which runs on every submission, needs no model, and cannot be reconfigured;
   * `ai_score` is whatever provider was configured at the time. Folding them together made
   * `graded_by` report `ai+teacher` on a deployment that had no model at all.
   */
  auto_score: number | null;
  auto_source: string | null;
  ai_score: number | null;
  ai_comment: string | null;
  ai_confidence: number | null;
  /** `mock` | `http` | null - the provenance of the `ai_*` columns specifically. */
  ai_source: string | null;
  teacher_score: number | null;
  teacher_comment: string | null;
  updated_at?: string | null;
}

/**
 * A photograph of a submission - the 拍照题 half of "answer it or photograph it".
 *
 * Deliberately has no `question_id`. A photo belongs to a submission, and a *question-scoped*
 * photo is recorded by that question's answer (`HomeworkAnswerValue.photo_ids`). The obvious
 * `question_id` column here was rejected because it closes a foreign-key cycle -
 * answers -> questions -> assignments, plus photos -> answers - and the account-deletion
 * cleanup registry orders its rules from the schema's foreign-key graph, so a cycle there is a
 * cycle in the deletion order. `plugins/homework/migrations/0001_init.sql` records the same
 * reasoning from the schema side.
 */
export interface HomeworkPhoto {
  id: number;
  submission_id: number;
  storage_path: string;
  mime: string;
  size: number;
  sha256: string;
  uploaded_by: number | null;
  created_at?: string | null;
}

export type HomeworkQaRole = 'student' | 'assistant';

export interface HomeworkQaMessage {
  id: number;
  assignment_id: number;
  student_id: number;
  role: HomeworkQaRole;
  content: string;
  ai_source: string | null;
  created_at?: string | null;
}

// ---------------------------------------------------------------------------
// Payloads

/** One question as a teacher writes it. `id` is present only when editing an existing row. */
export interface HomeworkQuestionPayload {
  id?: number;
  type: HomeworkQuestionType;
  stem: string;
  options?: HomeworkOption[];
  reference?: HomeworkReferenceAnswer;
  explanation?: string | null;
  points: number;
}

export interface HomeworkPublishPayload {
  class_id: number;
  title: string;
  description?: string | null;
  due_at?: string | null;
  status?: HomeworkStatus;
  reward_points?: number;
  questions?: HomeworkQuestionPayload[];
}

/**
 * An edit, including a whole-paper question replacement.
 *
 * `questions` present replaces the question list (ids that still exist are updated, new ones
 * inserted, the rest deleted), which is what an editor screen can actually produce. Omitting it
 * leaves the questions untouched - the distinction that keeps "fix a typo in the title" from
 * destroying answers.
 */
export interface HomeworkUpdatePayload {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  status?: HomeworkStatus;
  reward_points?: number;
  questions?: HomeworkQuestionPayload[];
}

export interface HomeworkAnswerInput {
  question_id: number;
  value: HomeworkAnswerValue;
}

export interface HomeworkSaveAnswersPayload {
  answers?: HomeworkAnswerInput[];
}

export interface HomeworkSubmitPayload {
  answers?: HomeworkAnswerInput[];
  /** Photos of the whole submission, not tied to one question. */
  photo_ids?: number[];
}

/** One graded question in a teacher's batch write. */
export interface HomeworkGradeEntryPayload {
  answer_id: number;
  teacher_score: number | null;
  teacher_comment?: string | null;
}

export interface HomeworkGradePayload {
  teacher_feedback?: string | null;
  /** `graded` publishes the score to the student; `returned` sends it back to fix. */
  status?: Extract<HomeworkSubmissionStatus, 'graded' | 'returned'>;
  answers?: HomeworkGradeEntryPayload[];
}

export interface HomeworkAiGradePayload {
  /** Omit to grade every submitted attempt of the assignment. */
  submission_ids?: number[];
  /**
   * When false (the default), a question the teacher already scored keeps that score.
   *
   * Defaulting to false is the safe direction: a batch AI run must not silently undo a
   * teacher's decision. The UI passes true only behind an explicit confirmation.
   */
  overwrite_teacher?: boolean;
}

export interface HomeworkQaAskPayload {
  content: string;
  /** The question the student is asking about, when the thread is anchored to one. */
  question_id?: number;
}

/**
 * What the teacher asks for when they press 「AI 出题」.
 *
 * ## Why there is no `class_id`
 *
 * The obvious context to hand a model would be the class's subject and grade level - and this
 * product does not store either: `classes` carries a name and a teacher, and `question_bank` has no
 * subject column. Inventing one here would mean pretending to know something the schema does not,
 * so the *teacher* supplies the context (`topic`, `grade`, `hint`) and the request stays honest.
 * `context_title` exists so a half-written 作业标题 can anchor an edit-in-place generation.
 *
 * ## Why this is not part of `HomeworkPublishPayload`
 *
 * Nothing is stored by this operation. It answers with *candidate* questions for the teacher to
 * edit, and they reach the paper only through the ordinary publish or edit payload above. That
 * keeps one write path (so the AI can never introduce a question the normal validation would
 * reject), keeps `p_homework_questions` free of drafts, and means a failed or nonsense generation
 * leaves no trace to clean up.
 */
export interface HomeworkAiGeneratePayload {
  /** What the questions should be about. Required - it is the whole prompt. */
  topic: string;
  /** `single` | `multiple` | `blank` | `short`; omit to let the model mix them. */
  type?: HomeworkQuestionType;
  /** How many candidates to ask for. Clamped server-side to 1..20. */
  count?: number;
  /** Optional grade level or difficulty, sent verbatim as prompt context. */
  grade?: string | null;
  /** Optional extra requirements ("每题 5 分", "贴近课本第三章"). */
  hint?: string | null;
  /** The title already typed in the dialog, when there is one. */
  context_title?: string | null;
  /**
   * Question stems already in the paper, so a second generation does not repeat the first.
   *
   * Stems rather than whole questions: a duplicate is recognised by what it *asks*, and sending the
   * reference answers back to the model would be sending the paper's own answer key out of the
   * building for no gain.
   */
  avoid?: string[];
}

/** One generation's outcome, shaped like every other AI payload here: the data plus how it went. */
export interface HomeworkAiGenerateResult {
  questions: HomeworkQuestionPayload[];
  /**
   * How many candidates the model offered that could not be used.
   *
   * Reported rather than silently dropped: a reply that produced 4 usable questions out of 10 is a
   * prompt or model problem the operator needs to see, and a count is the only honest way to say it
   * without showing the teacher JSON they cannot act on.
   */
  skipped: number;
  ai: HomeworkAiOutcome;
}

// ---------------------------------------------------------------------------
// Composite read shapes

/**
 * A homework row as the list endpoint returns it: the row, its question count, and the read-bridge
 * flag carried by `Homework.legacy`.
 *
 * Everything a `HomeworkDetail` carries except the questions themselves, which is what
 * `question_count` stands in for - so the list and detail payloads have one vocabulary and the
 * frontend can render a list card without a second fetch.
 */
export interface HomeworkListEntry extends Homework {
  /** `COUNT(p_homework_questions.id)` - 0 for a homework with no questions, and for a bridged row. */
  question_count: number;
}

/** A homework row with its questions - the editor and the attempt page both need this. */
export interface HomeworkDetail extends Homework {
  questions: HomeworkQuestion[];
}

/** A student's attempt: the submission, its answers and its photos, in one round trip. */
export interface HomeworkAttemptDetail {
  homework: HomeworkDetail;
  submission: HomeworkSubmission;
  answers: HomeworkAnswer[];
  photos: HomeworkPhoto[];
}

/** One row of the teacher's grade sheet: a submission plus the pupil it belongs to. */
export interface HomeworkGradeRow {
  submission: HomeworkSubmission;
  /** Decrypted by the repository, as the classroom port does for `StudentSnapshot.name`. */
  student_name: string;
}

/** What a student sees on their list: the homework and their own attempt, if any. */
export interface HomeworkStudentEntry {
  homework: Homework;
  submission: HomeworkSubmission | null;
  question_count: number;
}

/**
 * The outcome of one AI operation, carried inside the 200 response rather than as an error.
 *
 * AI is an *assist*: when it is unconfigured, unreachable or unsure, the write the teacher asked
 * for still succeeded and the operator needs to be told why the AI half is missing. A thrown
 * error would roll that back or, worse, leave the client guessing whether anything was saved.
 * `available: false` is therefore a first-class success payload, never a silent no-op.
 */
export interface HomeworkAiOutcome {
  source: string;
  available: boolean;
  /** 0..1; null when the provider declined to judge. */
  confidence: number | null;
  message: string;
}

export interface HomeworkAiGradeResult {
  submission: HomeworkSubmission;
  answers: HomeworkAnswer[];
  ai: HomeworkAiOutcome;
}

export interface HomeworkQaResult {
  messages: HomeworkQaMessage[];
  ai: HomeworkAiOutcome;
}

/** One question's graded outcome, returned to the AI panel so it can render per-line reasons. */
export interface HomeworkAiGradeLine {
  question_id: number;
  ai_score: number | null;
  ai_comment: string;
  ai_confidence: number | null;
}

// ---------------------------------------------------------------------------
// The cross-plugin port

/**
 * The homework AI provider's state, as the console reports it.
 *
 * `provider` is the *resolved* source (`mock` or `http`), not the requested one: a deployment that
 * asked for `http` without a base URL is running the mock, and a status line that echoed the request
 * would tell the operator their model was in use when it was not.
 */
export interface HomeworkAiState {
  /** `mock` | `http` - the provider that will answer the next request. */
  provider: string;
  available: boolean;
  /** Why the requested provider is not the running one, when there is a reason. */
  reason: string | null;
  /** One human-readable line the console prints verbatim. */
  message: string;
}

/**
 * One borrowed model call, and what came of it.
 *
 * `text: null` with `available: false` is the honest answer for "no model is configured" and for
 * "the model failed" alike; `message` is the one line the caller prints verbatim. Nothing here
 * throws, for the reason `HomeworkAiOutcome` documents: the AI half of a request is an assist, and
 * the caller usually has a deterministic result to show either way.
 *
 * Deliberately *not* typed in homework's vocabulary. A consumer supplies its own system prompt and
 * user prompt, so the model keeps answering whatever the caller asked it - this port carries no
 * grading, asking or 出题 concept, and homework learns nothing about its callers.
 */
export interface HomeworkAiCompletion {
  text: string | null;
  /** `mock` | `http` - the provider that actually answered, for provenance. */
  source: string;
  available: boolean;
  /** One human-readable line explaining the outcome, printed verbatim by the caller. */
  message: string;
}

/**
 * The `homework.public` port, consumed by `plugins/admin` and by other AI surfaces.
 *
 * Deliberately about the AI provider and nothing else. The console does not read homework, grade it
 * or look at its tables - it owns the five `ai_*` settings, the homework plugin owns the provider
 * those settings configure, and this is the one question that crosses that line: "is the model you
 * would use actually reachable?".
 *
 * Adding `getAiState` rather than leaving the console to read the settings itself is what keeps the
 * *resolution* rule - requested vs. actually running, and the fallback reason - in the one place
 * that implements it (`resolveHomeworkProvider`), instead of a second copy in the console that
 * would drift from it the first time the fallback changed.
 *
 * `testAiConnection` never throws: a model that is unreachable, misconfigured or slow is a *result*
 * for the operator to read, not a 500. That mirrors `HomeworkAiOutcome` on the plugin's own routes.
 *
 * ## Why `complete` is here
 *
 * A second AI surface (`plugins/ai-study`) needs a model for one narrow job: re-ranking candidates
 * a local rule has already chosen, and writing a short reason for each. The alternative was for that
 * plugin to re-implement "read the five `ai_*` settings, decide mock vs http, fall back with a
 * reason" - and two copies of a provider-resolution rule is exactly the drift the
 * `homework-generate-types` guardrail exists to prevent. So the model is borrowed from the plugin
 * that already owns the configuration, and the *prompt* stays with the borrower.
 *
 * Optional in the same strong sense as the rest of this port: `homework` is `required: false` and
 * sorts after its consumers, so a caller must resolve it per call (`ctx.tryUse`) and treat `null` as
 * "no model is installed here" - never as an error.
 */
export interface HomeworkAiPort {
  getAiState(): HomeworkAiState;
  testAiConnection(): Promise<{ ok: boolean; message: string }>;
  /**
   * One OpenAI-compatible chat completion against the configured model.
   *
   * `maxTokens` is the caller's own ceiling - a reranking reply is short, and a model that decides to
   * reason out loud must not be able to bill for a page (the same rule `homework.templates.ts`
   * applies to 出题). Omitted rather than defaulted when the caller has no budget of its own.
   *
   * `timeoutMs` is the caller's own deadline, and it is a *ceiling* over `ai_timeout_ms` rather than a
   * replacement: the operator configured how long this deployment is willing to wait for a model, and
   * a caller with a shorter patience (a practice set the student is watching a spinner for) may wait
   * less but never longer. Without it a caller's HTTP client would time out before the server replied
   * and the whole graceful-degradation path would be unreachable.
   */
  complete(request: {
    system: string;
    user: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<HomeworkAiCompletion>;
}

// ---------------------------------------------------------------------------
// Envelopes

export type HomeworkListResponse = ApiSuccess<HomeworkListEntry[]>;
export type HomeworkDetailResponse = ApiSuccess<HomeworkDetail>;
export type HomeworkGradeSheetResponse = ApiSuccess<HomeworkGradeRow[]>;
export type HomeworkAttemptResponse = ApiSuccess<HomeworkAttemptDetail>;
export type HomeworkStudentListResponse = ApiSuccess<HomeworkStudentEntry[]>;
export type HomeworkQaResponse = ApiSuccess<HomeworkQaResult>;
