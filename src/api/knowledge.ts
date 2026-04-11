import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

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

export const knowledgeApi = {
  getSubjects: () => apiGet<{ success: true; data: Subject[] }>('/api/knowledge/subjects'),
  createSubject: (data: { name: string; stage?: string | null; grade?: number | null }) =>
    apiPost<{ success: true; data: Subject }>('/api/knowledge/subjects', data),
  getNodes: (subjectId: number) =>
    apiGet<{ success: true; data: KnowledgeNode[] }>(`/api/knowledge/nodes?subject_id=${subjectId}`),
  createNode: (data: {
    subject_id: number;
    name: string;
    code?: string | null;
    parent_id?: number | null;
    importance?: number | null;
  }) => apiPost<{ success: true; data: KnowledgeNode }>('/api/knowledge/nodes', data),
  updateNode: (
    id: number,
    data: Partial<{ name: string; code: string | null; parent_id: number | null; importance: number | null }>,
  ) => apiPut<{ success: true; data: KnowledgeNode }>(`/api/knowledge/nodes/${id}`, data),
  deleteNode: (id: number) => apiDelete<{ success: true }>(`/api/knowledge/nodes/${id}`),
  getEdges: (subjectId: number) =>
    apiGet<{ success: true; data: KnowledgeEdge[] }>(`/api/knowledge/edges?subject_id=${subjectId}`),
  createEdge: (data: { subject_id: number; from_node_id: number; to_node_id: number; edge_type: string; weight?: number | null }) =>
    apiPost<{ success: true; data: KnowledgeEdge }>('/api/knowledge/edges', data),
  deleteEdge: (id: number) => apiDelete<{ success: true }>(`/api/knowledge/edges/${id}`),
};

