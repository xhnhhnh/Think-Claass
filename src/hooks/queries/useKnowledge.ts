import { useQuery } from '@tanstack/react-query';

import { knowledgeApi, type KnowledgeEdge, type KnowledgeNode, type Subject } from '@/api/knowledge';

export function useSubjects() {
  return useQuery({
    queryKey: ['knowledge-subjects'],
    queryFn: async () => {
      const data = await knowledgeApi.getSubjects();
      return data.data as Subject[];
    },
  });
}

export function useKnowledgeNodes(subjectId: number | null) {
  return useQuery({
    queryKey: ['knowledge-nodes', subjectId],
    queryFn: async () => {
      if (!subjectId) return [] as KnowledgeNode[];
      const data = await knowledgeApi.getNodes(subjectId);
      return data.data;
    },
    enabled: !!subjectId,
  });
}

export function useKnowledgeEdges(subjectId: number | null) {
  return useQuery({
    queryKey: ['knowledge-edges', subjectId],
    queryFn: async () => {
      if (!subjectId) return [] as KnowledgeEdge[];
      const data = await knowledgeApi.getEdges(subjectId);
      return data.data;
    },
    enabled: !!subjectId,
  });
}

