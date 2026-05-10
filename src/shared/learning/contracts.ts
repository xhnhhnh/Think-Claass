import type { ApiSuccess } from '../core/contracts';

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

export type AssignmentListResponse = ApiSuccess<{ assignments: Assignment[] }>;
export type ExamListResponse = ApiSuccess<{ exams: Exam[] }>;
export type ExamGradesResponse = ApiSuccess<{ exam: Exam; grades: ExamGrade[] }>;
