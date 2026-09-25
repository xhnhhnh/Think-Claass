/**
 * homework plugin internal types.
 *
 * These are the shapes that cross between this plugin's own layers - the SQL rows the repository
 * reads and the scope objects it filters by. They are deliberately NOT the HTTP contract: the DTOs
 * live in `@thinkclass/contracts/domains/homework`, and keeping the two apart is what lets the
 * repository answer with `SELECT *` columns while the service publishes a parsed, typed payload
 * (`options` / `reference` / `value` are JSON *strings* in the database and arrays and objects
 * over the wire).
 */

import type {
  Homework,
  HomeworkAnswer,
  HomeworkAnswerValue,
  HomeworkOption,
  HomeworkPhoto,
  HomeworkQaMessage,
  HomeworkQuestion,
  HomeworkQuestionType,
  HomeworkReferenceAnswer,
  HomeworkStatus,
  HomeworkSubmission,
  HomeworkSubmissionStatus,
} from '@thinkclass/contracts/domains/homework';

/** Raw `p_homework_assignments` row. Every column is what SQLite returns. */
export interface HomeworkRow extends Homework {
  /** The `assignments.id` this row was copied from, or null for homework born here. */
  legacy_id: number | null;
}

/** Raw `p_homework_questions` row: the three JSON columns are still strings here. */
export interface HomeworkQuestionRow {
  id: number;
  assignment_id: number;
  order_no: number;
  type: string;
  stem: string;
  options_json: string | null;
  answer_json: string | null;
  explanation: string | null;
  points: number;
  created_at: string | null;
}

/** Raw `p_homework_submissions` row. */
export interface HomeworkSubmissionRow extends HomeworkSubmission {
  legacy_id: number | null;
}

/** Raw `p_homework_answers` row: `answer_json` is still a string. */
export interface HomeworkAnswerRow {
  id: number;
  submission_id: number;
  question_id: number;
  answer_json: string | null;
  score: number | null;
  is_correct: number | null;
  auto_score: number | null;
  auto_source: string | null;
  ai_score: number | null;
  ai_comment: string | null;
  ai_confidence: number | null;
  ai_source: string | null;
  teacher_score: number | null;
  teacher_comment: string | null;
  updated_at: string | null;
}

/** Raw `p_homework_photos` row. */
export type HomeworkPhotoRow = HomeworkPhoto;

/** Raw `p_homework_qa_messages` row. */
export type HomeworkQaRow = HomeworkQaMessage;

/**
 * A grade-sheet row: the submission plus the pupil's decrypted name.
 *
 * `student_name` is joined in SQL and decrypted with the host's `config.decryptName`, exactly as
 * `plugins/assignments` labels `student_exams` - the column is AES-encrypted at rest, so the
 * plaintext must never be read without going through that function.
 */
export interface HomeworkGradeRowInternal {
  submission: HomeworkSubmissionRow;
  student_name: string;
}

/**
 * The scope a caller may read through, resolved by the service from the actor - never from the
 * request.
 *
 * `teacherId` is the ownership anchor a teacher's writes are checked against;
 * `classId` is the classroom the caller's login sits in (students and parents), or an explicit
 * narrowing an admin asked for.
 */
export interface HomeworkScope {
  classId?: number;
  teacherId?: number;
  status?: HomeworkStatus;
}

/**
 * A homework row as a list returns it: its question count, and whether it is a legacy row that
 * the read bridge surfaced.
 *
 * `legacy` is on the payload rather than inferable from the id because the two id spaces are
 * disjoint but unmarked - without it the frontend would offer an "edit" button on a row whose
 * `PUT` cannot work. It is `true` only for rows read out of the deprecated `assignments` table.
 */
export interface HomeworkListRow extends HomeworkRow {
  question_count: number;
  legacy?: boolean;
}

/** A homework row with its questions parsed - the detail and attempt views both need this. */
export interface HomeworkWithQuestions {
  homework: HomeworkListRow;
  questions: HomeworkQuestion[];
}

/** One answer as the service reads it back, with the JSON already parsed. */
export interface HomeworkAnswerWithValue extends Omit<HomeworkAnswer, 'value'> {
  value: HomeworkAnswerValue;
}

/**
 * Input to `createQuestion` / `updateQuestion`.
 *
 * `id` is present only when an existing row is being updated in place; `writeQuestions` uses its
 * absence-versus-presence to decide between an UPDATE and an INSERT, which is what preserves the
 * answers already written against a question when a teacher edits a paper.
 */
export interface HomeworkQuestionInput {
  id?: number;
  type: HomeworkQuestionType;
  stem: string;
  options: HomeworkOption[];
  reference: HomeworkReferenceAnswer;
  explanation: string | null;
  points: number;
}

/** One student's answer as it arrives from the client. */
export interface HomeworkAnswerInputInternal {
  question_id: number;
  value: HomeworkAnswerValue;
}

/** The statuses a student may still edit from. */
export type HomeworkEditableStatus = Extract<HomeworkSubmissionStatus, 'draft' | 'returned'>;

/**
 * A row read out of the deprecated `assignments` table by the read bridge.
 *
 * Only the columns the bridge actually selects - the legacy table has no `status`, no question
 * count and a `due_date` rather than a `due_at`, so this is a genuinely different shape from
 * `HomeworkRow` and is narrowed rather than reused.
 */
export interface LegacyAssignmentRow {
  id: number;
  class_id: number | null;
  teacher_id: number | null;
  title: string;
  description: string | null;
  due_date: string | null;
  reward_points: number | null;
  created_at: string | null;
}
