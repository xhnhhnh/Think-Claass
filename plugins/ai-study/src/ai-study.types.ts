/**
 * Row shapes and internal inputs for the ai-study domain.
 *
 * `*Row` interfaces are the SQLite shapes `ai-study.repository.ts` produces; the wire shapes the
 * routes answer with live in `@thinkclass/contracts/domains/ai-study`.
 *
 * Timestamps are ISO strings, written and read by the repository: these tables are created by this
 * plugin's own migration, so there is no Prisma projection to reproduce - the one place in this
 * repository where a plugin may choose its own storage format. ISO was chosen anyway, because a
 * debug session that has to remember two date formats is a bug waiting to be written.
 */

/** The caller, as the controllers resolve it from the kernel request context. */
export interface Actor {
  id: number | null;
  role: string | null;
}

export interface StudySetRow {
  id: number;
  student_id: number;
  class_id: number | null;
  subject_id: number | null;
  /** `self` | `assigned` */
  source: string;
  created_by: number | null;
  /** `open` | `done` */
  status: string;
  engine_version: number;
  ai_source: string;
  ai_available: number;
  ai_message: string;
  created_at: string;
  updated_at: string;
}

export interface StudyItemRow {
  id: number;
  set_id: number;
  question_id: number;
  order_no: number;
  reason: string;
  score: number;
  /** JSON object of factor name -> contribution. See `ai-study.engine.ts`. */
  factors_json: string;
  ai_ranked: number;
  created_at: string;
}

export interface StudyAnswerRow {
  id: number;
  set_id: number;
  item_id: number;
  answer_json: string | null;
  /** NULL is "nobody judged this"; see `LearningPracticeOutcome`. */
  is_correct: number | null;
  spent_sec: number;
  mastery_score: number | null;
  /** NULL means the owner was never asked; set it and this answer is never judged twice. */
  judged_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A set with its rows already loaded, as the service passes it around. */
export interface StudySetBundle {
  set: StudySetRow;
  items: StudyItemRow[];
  answers: StudyAnswerRow[];
}

/**
 * One question as the engine sees it.
 *
 * Structurally the same as `LearningQuestionRef`, restated here so the engine has no import from a
 * transport contract: it is a pure function over plain data, which is what lets it be unit-tested
 * without a kernel, a database or a plugin context.
 */
export interface EngineCandidate {
  questionId: number;
  type: string;
  difficulty: number | null;
  points: number;
  subjectId: number | null;
  nodeIds: number[];
  isSubjective: boolean;
}

/** One wrong-question row, flattened for scoring. */
export interface EngineWrongSignal {
  questionId: number;
  wrongCount: number;
  masteryScore: number;
  nodeIds: number[];
}

/**
 * One knowledge node the student has missed something on.
 *
 * Only *weak* nodes: a node absent from this list is one with no wrong question, which is the same
 * "nothing to review here" the engine wants for its weak-node factor.
 */
export interface EngineWeakNode {
  nodeId: number;
  name: string;
  importance: number | null;
  wrongCount: number;
}

export interface EngineInput {
  candidates: EngineCandidate[];
  wrongQuestions: EngineWrongSignal[];
  weakNodes: EngineWeakNode[];
  /** Graded objective answers across all papers; `total: 0` means "no data". */
  accuracy: { correct: number; total: number };
  /** Hard exclusions, e.g. the questions already in a set being replaced. */
  excludeQuestionIds: number[];
  /** How many items the set should hold; clamped by the engine. */
  size: number;
}

export interface RankedCandidate {
  questionId: number;
  type: string;
  difficulty: number | null;
  points: number;
  score: number;
  factors: Record<string, number>;
  reason: string;
}
