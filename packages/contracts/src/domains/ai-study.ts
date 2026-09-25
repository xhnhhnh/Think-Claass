/**
 * ai-study domain contracts (`AI 智学`).
 *
 * The wire shapes of `plugins/ai-study`: one personalised practice set for a student, the
 * class-level view a teacher dispatches from, and the provenance block every AI-bearing
 * response carries.
 *
 * Type-only: see guardrail G6.
 *
 * ## What is deliberately absent
 *
 * No reference answer and no explanation, on any of these shapes. The practice set is shown
 * to the student before they answer it, so a DTO carrying the answer key would put it one
 * browser devtools panel away. The question owner decides whether an answer was right
 * (`learning.public.recordPracticeOutcome`), and the student sees the result of that
 * decision - never the key it was computed from.
 */

import type { ApiSuccess } from '@thinkclass/contracts';

/**
 * What the AI half of a request was.
 *
 * The same four fields `HomeworkAiOutcome` carries, and for the same reason: an unconfigured
 * or unreachable model is a *success* payload, not an error, because the deterministic half
 * of the response is still worth showing. `available: false` means the rule engine's own
 * ranking is what the caller is looking at, and `message` is the line the UI prints verbatim.
 */
export interface AiStudyOutcome {
  /** `mock` | `http` - the provider that answered, or would have. */
  source: string;
  available: boolean;
  /** 0..1, or null when there is nothing to be confident about (e.g. no model ran). */
  confidence: number | null;
  message: string;
}

export interface AiStudyQuestionOption {
  id: string;
  text: string;
}

/**
 * A question as the student sees it: enough to answer, nothing more.
 *
 * `points` is `questions.default_points`, which is what the practice set offers. `difficulty`
 * is passed through because the reason line quotes it ("难度接近你的水平"), and a null there
 * is the honest "the teacher did not set one" rather than a defaulted 3.
 */
export interface AiStudyQuestion {
  id: number;
  type: string;
  stem: string;
  options: AiStudyQuestionOption[];
  points: number;
  difficulty: number | null;
}

/** One line of a set: the question, why it is here, and what the student has answered so far. */
export interface AiStudySetItem {
  id: number;
  question_id: number;
  order_no: number;
  /** Why this question was chosen, in the student's own language. */
  reason: string;
  /** The rule's total for this candidate. */
  score: number;
  /** The per-factor breakdown behind `score`, so the ranking can be read rather than trusted. */
  factors: Record<string, number>;
  /** True when a model re-ranked this item; the UI labels the source differently because of it. */
  ai_ranked: boolean;
  question: AiStudyQuestion;
  /** The student's saved answer, or null before they have written one. */
  answer: { value: string; is_correct: boolean | null } | null;
}

export interface AiStudySet {
  id: number;
  student_id: number;
  class_id: number | null;
  subject_id: number | null;
  /** `self` (the student generated it) or `assigned` (a teacher dispatched it). */
  source: string;
  /** `open` (still to do) or `done` (submitted). */
  status: string;
  /** Which ranking rule produced this set; see `plugin.json` `_engine_note`. */
  engine_version: number;
  created_at: string;
  updated_at: string;
  items: AiStudySetItem[];
}

/**
 * The generation's own provenance, carried beside the set rather than inside it.
 *
 * Every endpoint that answers with a set also answers with this, and it is stored on the set row, so
 * a set read a week later still says which provider made it and why - or that none did. It is *not* a
 * field of `AiStudySet` because it is equally the answer to "why is there no set": an empty question
 * bank produces `set: null` with this explaining the reason, and two shapes for one truth would drift.
 */
export interface AiStudySetResult {
  set: AiStudySet | null;
  ai: AiStudyOutcome;
}

/** The result of one practice answer, as the owner of the question judged it. */
export interface AiStudyAnsweredItem {
  item_id: number;
  question_id: number;
  /**
   * `null` is "nobody judged this" - a subjective question, or one with no reference answer
   * configured. It is deliberately not `false`, and no mastery was moved for it.
   */
  is_correct: boolean | null;
  mastery_score: number | null;
}

export interface AiStudySubmitResult {
  set_id: number;
  total: number;
  correct: number;
  /** Items the owner declined to judge; they are neither correct nor wrong. */
  pending: number;
  items: AiStudyAnsweredItem[];
  ai: AiStudyOutcome;
}

/** A knowledge node the class is collectively missing. */
export interface AiStudyWeakNode {
  node_id: number;
  name: string;
  importance: number | null;
  wrong_count: number;
  /** How many of the students considered have a wrong question filed under this node. */
  student_count: number;
}

/** One student's next step, as the class board proposes it. */
export interface AiStudyStudentSuggestion {
  student_id: number;
  name: string;
  top_node_id: number | null;
  top_node_name: string | null;
  wrong_count: number;
  /** The set they already have open, so the board offers 查看 rather than a duplicate 派发. */
  open_set_id: number | null;
  reason: string;
}

export interface AiStudyClassInsight {
  class_id: number;
  /** Students actually analysed - capped, see `AI_STUDY_CLASS_LIMIT`. */
  students_considered: number;
  /** The class size, so a truncated board says so instead of looking complete. */
  students_total: number;
  weak_nodes: AiStudyWeakNode[];
  suggestions: AiStudyStudentSuggestion[];
  ai: AiStudyOutcome;
}

export interface AiStudyAssignPayload {
  student_ids: number[];
  subject_id?: number | null;
  /** How many questions each set should hold; the server clamps it. */
  size?: number;
  /** Optional free text the model may use when it writes reasons. */
  hint?: string | null;
}

export interface AiStudyAssignResult {
  class_id: number;
  created: Array<{ student_id: number; set_id: number }>;
  /** Per-student failures, so one bad row cannot void a whole dispatch. */
  failed: Array<{ student_id: number; reason: string }>;
  ai: AiStudyOutcome;
}

export type AiStudySetResponse = ApiSuccess<AiStudySetResult>;
export type AiStudyCurrentSetResponse = ApiSuccess<AiStudySetResult>;
export type AiStudySubmitResponse = ApiSuccess<AiStudySubmitResult>;
export type AiStudyClassInsightResponse = ApiSuccess<AiStudyClassInsight>;
export type AiStudyAssignResponse = ApiSuccess<AiStudyAssignResult>;
