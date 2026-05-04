import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiDelete: mocks.apiDelete,
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { portalApi } from './portalApi';

describe('portalApi', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('uses website home and article paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    await portalApi.getHomeContent();
    await portalApi.updateHomeContent({ hero: { title: 'Hi' } });
    await portalApi.getArticles({ is_published: true, limit: 3 });
    await portalApi.getArticle(7);
    await portalApi.createArticle({ title: 'T', content: 'C' });
    await portalApi.updateArticle(7, { title: 'T2', content: 'C2' });
    await portalApi.deleteArticle(7);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/website/home');
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/website/home', { hero: { title: 'Hi' } });
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/website/articles?is_published=true&limit=3');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/website/articles/7');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/website/articles', { title: 'T', content: 'C' });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/website/articles/7', { title: 'T2', content: 'C2' });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/website/articles/7');
  });

  it('submits contact messages', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    await portalApi.submitContact({ name: 'A', email: 'a@example.com', message: 'Hello' });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/website/contact', { name: 'A', email: 'a@example.com', message: 'Hello' });
  });
});
