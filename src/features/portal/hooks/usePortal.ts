import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { portalApi } from '../api/portalApi';
import type { ArticleListQuery, ArticlePayload, HomeContentDto } from '@/shared/portal/contracts';

export const portalKeys = {
  home: ['portal', 'home'] as const,
  articles: (query?: ArticleListQuery) => ['portal', 'articles', query ?? {}] as const,
  article: (id: number | null) => ['portal', 'article', id] as const,
};

export function useHomeContent() {
  return useQuery({ queryKey: portalKeys.home, queryFn: () => portalApi.getHomeContent() });
}

export function usePortalArticles(query?: ArticleListQuery) {
  return useQuery({ queryKey: portalKeys.articles(query), queryFn: () => portalApi.getArticles(query) });
}

export function usePortalArticle(id: number | null) {
  return useQuery({
    queryKey: portalKeys.article(id),
    queryFn: async () => {
      if (!id) return null;
      const response = await portalApi.getArticle(id);
      return response.article;
    },
    enabled: !!id,
  });
}

export function useUpdateHomeContentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: HomeContentDto) => portalApi.updateHomeContent(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: portalKeys.home }),
  });
}

export function useArticleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { type: 'create'; data: ArticlePayload } | { type: 'update'; id: number; data: ArticlePayload } | { type: 'delete'; id: number }) => {
      if (payload.type === 'create') return portalApi.createArticle(payload.data);
      if (payload.type === 'update') return portalApi.updateArticle(payload.id, payload.data);
      return portalApi.deleteArticle(payload.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal', 'articles'] }),
  });
}
