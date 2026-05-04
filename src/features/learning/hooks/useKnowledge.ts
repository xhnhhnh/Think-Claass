import { useQuery } from '@tanstack/react-query';
import { knowledgeApi, type KnowledgeEdge, type KnowledgeNode, type Subject } from '../api/knowledgeApi';

export const knowledgeKeys = {
  subjects: ['knowledge-subjects'] as const,
  nodes: (subjectId: number | null) => ['knowledge-nodes', subjectId] as const,
  edges: (subjectId: number | null) => ['knowledge-edges', subjectId] as const,
};

export function useSubjects() {
  return useQuery({ queryKey: knowledgeKeys.subjects, queryFn: async () => (await knowledgeApi.getSubjects()).data as Subject[] });
}

export function useKnowledgeNodes(subjectId: number | null) {
  return useQuery({
    queryKey: knowledgeKeys.nodes(subjectId),
    queryFn: async () => {
      if (!subjectId) return [] as KnowledgeNode[];
      return (await knowledgeApi.getNodes(subjectId)).data;
    },
    enabled: !!subjectId,
  });
}

export function useKnowledgeEdges(subjectId: number | null) {
  return useQuery({
    queryKey: knowledgeKeys.edges(subjectId),
    queryFn: async () => {
      if (!subjectId) return [] as KnowledgeEdge[];
      return (await knowledgeApi.getEdges(subjectId)).data;
    },
    enabled: !!subjectId,
  });
}
