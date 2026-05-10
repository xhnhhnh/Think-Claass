import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { ArticleDto, ArticleListQuery, ArticlePayload, ContactMessagePayload, HomeContentDto } from '@/shared/portal/contracts';

function articleQuery(query: ArticleListQuery = {}) {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  if (query.is_published !== undefined) params.set('is_published', String(query.is_published));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const portalApi = {
  getHomeContent: () => apiGet<{ success: true; data: HomeContentDto }>('/api/website/home'),
  updateHomeContent: (payload: HomeContentDto) => apiPut<{ success: true; message?: string }>('/api/website/home', payload),
  getArticles: (query?: ArticleListQuery) =>
    apiGet<{ success: true; articles: ArticleDto[]; total: number }>(`/api/website/articles${articleQuery(query)}`),
  getArticle: (id: number) => apiGet<{ success: true; article: ArticleDto }>(`/api/website/articles/${id}`),
  createArticle: (payload: ArticlePayload) => apiPost<{ success: true; id: number; message?: string }>('/api/website/articles', payload),
  updateArticle: (id: number, payload: ArticlePayload) => apiPut<{ success: true; message?: string }>(`/api/website/articles/${id}`, payload),
  deleteArticle: (id: number) => apiDelete<{ success: true; message?: string }>(`/api/website/articles/${id}`),
  submitContact: (payload: ContactMessagePayload) => apiPost<{ success: true; id: number; message: string }>('/api/website/contact', payload),
};
