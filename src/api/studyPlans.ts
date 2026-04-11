import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { KnowledgeNode } from '@/api/knowledge';
import type { Question } from '@/api/papers';

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

export const studyPlansApi = {
  my: () => apiGet<{ success: true; data: StudyPlan | null }>('/api/study-plans/my'),
  create: (data: { target_exam_date?: string | null; target_score?: number | null }) =>
    apiPost<{ success: true; data: StudyPlan }>('/api/study-plans', data),
  updateItem: (itemId: number, data: { status: string }) =>
    apiPut<{ success: true; data: StudyPlanItem }>(`/api/study-plans/items/${itemId}`, data),
};

