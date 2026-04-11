import { apiGet, apiPost, apiPut } from '@/lib/api';

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
  subjects?: { id: number; name: string } | null;
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

export const papersApi = {
  list: (classId?: number) => {
    const suffix = classId ? `?class_id=${classId}` : '';
    return apiGet<{ success: true; data: Paper[] }>(`/api/papers${suffix}`);
  },
  create: (data: { title: string; class_id?: number | null; subject_id?: number | null; total_points?: number; source?: string; exam_date?: string | null }) =>
    apiPost<{ success: true; data: Paper }>('/api/papers', data),
  get: (paperId: number) => apiGet<{ success: true; data: PaperDetail }>(`/api/papers/${paperId}`),
  update: (
    paperId: number,
    data: Partial<{ title: string; status: string; class_id: number | null; subject_id: number | null; total_points: number; exam_date: string | null }>,
  ) => apiPut<{ success: true; data: Paper }>(`/api/papers/${paperId}`, data),
  saveStructure: (paperId: number, data: { sections: Array<{ title: string; order_no: number }>; items: any[]; rubric_points: any[] }) =>
    apiPut<{ success: true; data: PaperDetail }>(`/api/papers/${paperId}/structure`, data),
};
