/**
 * learning domain contracts.
 *
 * Moved from `src/shared/learning/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { ApiSuccess } from '@thinkclass/contracts';

export interface Assignment {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  reward_points: number;
  created_at?: string | null;
}

export interface StudentAssignment {
  id: number;
  assignment_id: number;
  student_id: number;
  status: string;
  content: string | null;
  score: number | null;
  teacher_feedback: string | null;
  submitted_at?: string | null;
}

export interface AssignmentPayload {
  class_id: number;
  teacher_id: number;
  title: string;
  description?: string | null;
  due_date?: string | null;
  reward_points?: number;
}

export interface StudentAssignmentUpdatePayload {
  status?: string;
  content?: string | null;
  score?: number | null;
  teacher_feedback?: string | null;
}

export interface Exam {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  exam_date: string | null;
  total_score: number;
  created_at: string;
}

export interface ExamGrade {
  id: number;
  exam_id: number;
  student_id: number;
  student_name: string;
  score: number | null;
  feedback: string | null;
}

export interface ExamPayload {
  class_id: number;
  teacher_id: number;
  title: string;
  description?: string | null;
  exam_date?: string | null;
  total_score: number;
}

export interface SaveExamGradePayload {
  student_id: number;
  score: number | null;
  feedback?: string | null;
}

export interface Paper {
  id: number;
  teacher_id: number;
  class_id: number | null;
  subject_id: number | null;
  title: string;
  source: string;
  status: string;
  total_points: number;
  exam_date: string | null;
  created_at: string | null;
  subjects?: Subject | null;
}

export interface Question {
  id: number;
  teacher_id: number | null;
  subject_id: number | null;
  stem: string;
  type: string;
  options_json: string | null;
  answer_json: string | null;
  explanation: string | null;
  difficulty: number | null;
  is_subjective: number | null;
  default_points: number | null;
  created_at: string | null;
}

export interface PaperSection {
  id: number;
  paper_id: number;
  title: string;
  order_no: number;
  created_at: string | null;
}

export interface RubricPoint {
  id: number;
  paper_item_id: number;
  label: string;
  points: number;
  keywords_json: string | null;
  step_order: number;
  created_at: string | null;
}

export interface PaperItem {
  id: number;
  paper_id: number;
  section_id: number | null;
  question_id: number;
  order_no: number;
  points_override: number | null;
  difficulty_override: number | null;
  rubric_json: string | null;
  created_at: string | null;
  questions?: Question;
  rubric_points?: RubricPoint[];
}

export interface PaperAsset {
  id: number;
  paper_id: number;
  kind: string;
  storage_path: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string | null;
}

export interface PaperDetail extends Paper {
  paper_assets: PaperAsset[];
  paper_sections: PaperSection[];
  paper_items: PaperItem[];
}

export interface PaperSubmission {
  id: number;
  paper_id: number;
  student_id: number;
  started_at: string | null;
  submitted_at: string | null;
  total_time_sec: number | null;
  created_at: string | null;
}

export interface Subject {
  id: number;
  name: string;
  stage: string | null;
  grade: number | null;
  created_at: string | null;
}

export interface KnowledgeNode {
  id: number;
  subject_id: number;
  name: string;
  code: string | null;
  parent_id: number | null;
  importance: number | null;
  created_at: string | null;
}

export interface KnowledgeEdge {
  id: number;
  subject_id: number;
  from_node_id: number;
  to_node_id: number;
  edge_type: string;
  weight: number | null;
  created_at: string | null;
}

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

export interface StudyPlanItem {
  id: number;
  plan_id: number;
  kind: string;
  knowledge_node_id: number | null;
  question_id: number | null;
  due_date: string | null;
  estimated_min: number | null;
  status: string;
  created_at: string | null;
  knowledge_nodes?: KnowledgeNode | null;
  questions?: Question | null;
}

export interface StudyPlan {
  id: number;
  student_id: number;
  target_exam_date: string | null;
  target_score: number | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  study_plan_items: StudyPlanItem[];
}

// ---------------------------------------------------------------------------
// Cross-plugin port.
//
// `learning` owns eighteen tables (the question bank, the knowledge graph, papers and
// their items/answers/submissions, wrong questions and study plans). Guardrail G1
// forbids another plugin reading those tables, so a domain that needs them - the
// `ai-study` personalisation engine is the first - must come through this port.
//
// ## What this port deliberately does NOT carry
//
// No reference answer and no explanation, on the question *or* on the signal. A
// consumer picks questions and shows them; deciding whether an answer is right is the
// question owner's job (`recordPracticeOutcome` takes the raw answer and judges it
// here, with the same comparison `submitPaper` uses). The practical consequence is
// that the student-facing practice API cannot leak an answer key even by accident -
// the answer never crosses the boundary in that direction.
//
// ## Refusals
//
// Return-value, matching `ClassroomResult`: `getStudentSignals` answers `null` for a
// student that does not exist, and everything else answers an empty list rather than
// throwing. Authorization is *not* here - a port has no request actor, so the caller
// proves "this student is mine to ask about" through `classroom.public` first. That
// split is the one `PetAuthorization` records.
// ---------------------------------------------------------------------------

/** One selectable option, parsed from `questions.options_json` by the owner. */
export interface LearningQuestionOption {
  id: string;
  text: string;
}

/**
 * A question as another plugin may see it.
 *
 * `subjectId` / `teacherId` are the owning ids, not names. `isSubjective` is the
 * `is_subjective` column as a boolean, because that is the question the consumer
 * actually asks: "can a machine mark this?" - `recordPracticeOutcome` answers
 * `isCorrect: null` for the subjective ones rather than guessing.
 */
export interface LearningQuestionRef {
  id: number;
  teacherId: number | null;
  subjectId: number | null;
  type: string;
  stem: string;
  options: LearningQuestionOption[];
  difficulty: number | null;
  isSubjective: boolean;
  defaultPoints: number;
}

/**
 * What a consumer may ask for when it wants a pool of candidate questions.
 *
 * Every filter is applied by the owner, and `limit` is *required* rather than optional
 * so a caller cannot accidentally read the whole bank: the port clamps it to its own
 * ceiling (200) as well.
 */
export interface LearningCandidateFilter {
  subjectId: number | null;
  /** Knowledge nodes to restrict to; empty means "any node". */
  nodeIds: number[];
  /** Question types to admit; empty means "any type". */
  types: string[];
  difficultyMin: number | null;
  difficultyMax: number | null;
  excludeQuestionIds: number[];
  limit: number;
}

/**
 * One wrong-question row, with the knowledge nodes the question is filed under.
 *
 * `nodeIds` is here rather than behind a second call because the alternative is one
 * query per wrong question, which is the shape a scoring loop must not have.
 */
export interface LearningWrongQuestionSignal {
  questionId: number;
  wrongCount: number;
  /** 0..1; 0 for a row that has never been practised. */
  masteryScore: number;
  lastWrongAt: string | null;
  nodeIds: number[];
}

/** A student's record on one knowledge node, over `question_knowledge` and `wrong_questions`. */
export interface LearningKnowledgeProgress {
  nodeId: number;
  name: string;
  importance: number | null;
  wrongCount: number;
  attemptCount: number;
  correctCount: number;
}

export interface LearningStudentSignals {
  studentId: number;
  wrongQuestions: LearningWrongQuestionSignal[];
  knowledgeProgress: LearningKnowledgeProgress[];
  /**
   * How this student has done on graded objective questions, across all papers.
   *
   * `total: 0` means "no data", which is different from "answered nothing correctly":
   * the consumer uses it to pick a target difficulty and must fall back to a neutral
   * default rather than reading 0% as a failure.
   */
  recentPaperAccuracy: { correct: number; total: number };
}

/**
 * What came of one practice answer.
 *
 * `isCorrect: null` is "the owner declines to judge this" - a subjective question, or
 * one with no reference answer configured. It is deliberately not `false`, and
 * `masteryScore` may be unchanged in that case: `false` would be a mark the engine
 * invented, which is the one thing this whole surface refuses to do.
 */
export interface LearningPracticeOutcome {
  isCorrect: boolean | null;
  masteryScore: number | null;
  /** True when this answer took the wrong question over the clearing threshold. */
  cleared: boolean;
}

export interface LearningPort {
  getStudentSignals(studentId: number): Promise<LearningStudentSignals | null>;
  listCandidates(filter: LearningCandidateFilter): Promise<LearningQuestionRef[]>;
  /**
   * Resolve the questions a stored practice set refers to.
   *
   * Needed because a consumer stores *ids* and renders a saved set later, and the alternative -
   * copying each stem into the consumer's own table - would put a second copy of a question in the
   * database and make "which version did the student answer" unanswerable. Missing ids are simply
   * absent from the result rather than an error: a consumer renders the items it can resolve.
   */
  listQuestionsByIds(questionIds: number[]): Promise<LearningQuestionRef[]>;
  /**
   * Which knowledge nodes these questions are filed under, in one call.
   *
   * The scoring rule needs it for *candidates*, not only for questions the student has already
   * missed - a question becomes interesting precisely because its node is a weak spot. One call for
   * the whole pool, because the per-question form is the N+1 that only shows up on the class that
   * has been using the product longest.
   */
  listQuestionKnowledgeMap(questionIds: number[]): Promise<Array<{ questionId: number; nodeId: number }>>;
  listSubjects(): Promise<Subject[]>;
  listKnowledgeNodes(subjectId: number): Promise<KnowledgeNode[]>;
  /**
   * Judge one practice answer and fold it into the student's wrong-question record.
   *
   * The write belongs to the owner, not the caller: mastery is one number with one
   * definition (the `+0.2 / -0.1` step and the `0.95` clearing threshold
   * `attemptWrongQuestion` already implements), and a second implementation of it in
   * another plugin would drift from the wrong-question book the student sees.
   *
   * A question the student has never got wrong gets a `wrong_questions` row on an
   * incorrect answer, exactly as `submitPaper` creates one - so the practice flow feeds
   * the same book rather than a parallel one.
   */
  recordPracticeOutcome(input: {
    studentId: number;
    questionId: number;
    answerJson: string | null;
    spentSec: number;
    /** Provenance for `wrong_question_attempts.practice_source`; `ai_study` for this consumer. */
    source: string;
  }): Promise<LearningPracticeOutcome>;
}

export type AssignmentListResponse = ApiSuccess<{ assignments: Assignment[] }>;
export type ExamListResponse = ApiSuccess<{ exams: Exam[] }>;
export type ExamGradesResponse = ApiSuccess<{ exam: Exam; grades: ExamGrade[] }>;
