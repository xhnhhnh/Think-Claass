/**
 * Row shapes for the learning domain.
 *
 * These are the *wire* shapes, not the SQLite shapes: every `DateTime` column is
 * converted to the ISO-8601 string Prisma produced before this domain moved, because
 * those strings are what the frontend and `@thinkclass/contracts/domains/learning`
 * declare. `learning.repository.ts` owns both directions of that conversion.
 *
 * The relation keys (`subjects`, `paper_items`, `questions`, `rubric_points`,
 * `knowledge_nodes`, `study_plans`, `papers`) are the model names, because that is what
 * Prisma's `include` projected and therefore what is deployed today.
 */

/** The caller, as the controllers resolve it from the request context. */
export interface Actor {
  id: number | null;
  role: string | null;
}

export interface SubjectRow {
  id: number;
  name: string;
  stage: string | null;
  grade: number | null;
  created_at: string | null;
}

export interface KnowledgeNodeRow {
  id: number;
  subject_id: number;
  name: string;
  code: string | null;
  parent_id: number | null;
  importance: number | null;
  created_at: string | null;
}

export interface KnowledgeEdgeRow {
  id: number;
  subject_id: number;
  from_node_id: number;
  to_node_id: number;
  edge_type: string;
  weight: number | null;
  created_at: string | null;
}

export interface QuestionRow {
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

export interface PaperRow {
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
}

export interface PaperWithSubject extends PaperRow {
  subjects: SubjectRow | null;
}

export interface PaperAssetRow {
  id: number;
  paper_id: number;
  kind: string;
  storage_path: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string | null;
}

export interface PaperSectionRow {
  id: number;
  paper_id: number;
  title: string;
  order_no: number;
  created_at: string | null;
}

export interface PaperItemRow {
  id: number;
  paper_id: number;
  section_id: number | null;
  question_id: number;
  order_no: number;
  points_override: number | null;
  difficulty_override: number | null;
  rubric_json: string | null;
  created_at: string | null;
}

export interface RubricPointRow {
  id: number;
  paper_item_id: number;
  label: string;
  points: number;
  keywords_json: string | null;
  step_order: number;
  created_at: string | null;
}

export interface PaperAnswerRow {
  id: number;
  submission_id: number;
  paper_item_id: number;
  answer_json: string | null;
  score: number | null;
  is_correct: number | null;
  time_spent_sec: number | null;
  error_type: string | null;
  created_at: string | null;
}

export interface PaperSubmissionRow {
  id: number;
  paper_id: number;
  student_id: number;
  started_at: string | null;
  submitted_at: string | null;
  total_time_sec: number | null;
  created_at: string | null;
}

export interface PaperItemWithRelations extends PaperItemRow {
  questions: QuestionRow | null;
  rubric_points: RubricPointRow[];
}

export interface PaperDetailRow extends PaperRow {
  subjects: SubjectRow | null;
  paper_assets: PaperAssetRow[];
  paper_sections: PaperSectionRow[];
  paper_items: PaperItemWithRelations[];
}

/** `savePaperStructure` re-reads the paper without `subjects` / `paper_assets`. */
export interface PaperStructureRow extends PaperRow {
  paper_sections: PaperSectionRow[];
  paper_items: PaperItemWithRelations[];
}

export interface AnswerWithItemQuestion extends PaperAnswerRow {
  paper_items: PaperItemRow & { questions: QuestionRow | null };
}

export interface SubmissionWithAnswerSheet extends PaperSubmissionRow {
  papers: PaperRow;
  paper_answers: AnswerWithItemQuestion[];
}

export interface WrongQuestionRow {
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
}

export interface WrongQuestionWithQuestion extends WrongQuestionRow {
  questions: QuestionRow | null;
}

export interface WrongQuestionAttemptRow {
  id: number;
  wrong_question_id: number;
  practice_source: string;
  is_correct: number | null;
  spent_sec: number | null;
  created_at: string | null;
}

export interface StudyPlanRow {
  id: number;
  student_id: number;
  target_exam_date: string | null;
  target_score: number | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudyPlanItemRow {
  id: number;
  plan_id: number;
  kind: string;
  knowledge_node_id: number | null;
  question_id: number | null;
  due_date: string | null;
  estimated_min: number | null;
  status: string;
  created_at: string | null;
}

export interface StudyPlanItemWithRelations extends StudyPlanItemRow {
  questions: QuestionRow | null;
  knowledge_nodes: KnowledgeNodeRow | null;
}

export interface StudyPlanWithItems extends StudyPlanRow {
  study_plan_items: StudyPlanItemWithRelations[];
}

/** The two columns `savePaperStructure` needs from the paper row. */
export interface PaperOwnership {
  teacher_id: number;
  subject_id: number | null;
}
