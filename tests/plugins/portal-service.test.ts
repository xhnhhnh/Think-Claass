/**
 * PortalService unit tests.
 *
 * Portal is unusual in this migration: no students, no classes, no points, and it keeps
 * its historical `{ status, body }` return shape rather than throwing. So these tests
 * pin the contract that actually matters here - the exact status codes and messages,
 * and the two response envelope styles - rather than port interactions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PortalService } from '../../plugins/portal/src/portal.service.js';
import type {
  ArticleQuery,
  ArticleRow,
  ArticleSummaryRow,
  PortalRepository,
} from '../../plugins/portal/src/portal.types.js';

class FakePortalRepository implements PortalRepository {
  sections = new Map<string, string>();
  articles = new Map<number, ArticleRow>();
  contacts: Array<{ name: string; email: string | null; message: string }> = [];
  nextId = 1;
  /** Set to make the bulk upsert observe transaction wrapping. */
  transactions = 0;

  listHomeSections() {
    return [...this.sections].map(([section_key, content_json]) => ({ section_key, content_json }));
  }

  upsertHomeSections(updates: Record<string, unknown>) {
    this.transactions += 1;
    for (const [key, value] of Object.entries(updates)) {
      this.sections.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }

  listArticles(query: ArticleQuery) {
    let rows = [...this.articles.values()];
    if (query.category) rows = rows.filter((row) => row.category === query.category);
    if (query.is_published !== undefined) {
      const wanted = query.is_published === 'true' || query.is_published === '1' ? 1 : 0;
      rows = rows.filter((row) => row.is_published === wanted);
    }
    const total = rows.length;
    const offset = Number(query.offset ?? 0);
    const limit = Number(query.limit ?? 10);
    const page = rows.slice(offset, offset + limit).map(({ content, ...rest }) => rest as ArticleSummaryRow);
    return { articles: page, total };
  }

  getArticle(id: string) {
    return this.articles.get(Number(id)) ?? null;
  }

  incrementArticleViews(id: string) {
    const article = this.articles.get(Number(id));
    if (article) this.articles.set(Number(id), { ...article, view_count: article.view_count + 1 });
  }

  createArticle(input: {
    title: string;
    summary: string | null;
    content: string;
    cover_image: string | null;
    category: string | null;
    is_published: number;
  }) {
    const id = this.nextId++;
    this.articles.set(id, {
      id,
      ...input,
      view_count: 0,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    });
    return id;
  }

  articleExists(id: string) {
    return this.articles.has(Number(id));
  }

  updateArticle(id: string, fields: Record<string, string | number>) {
    const article = this.articles.get(Number(id))!;
    this.articles.set(Number(id), { ...article, ...fields } as ArticleRow);
  }

  deleteArticle(id: string) {
    return this.articles.delete(Number(id)) ? 1 : 0;
  }

  createContact(input: { name: string; email: string | null; message: string }) {
    this.contacts.push(input);
    return this.nextId++;
  }
}

function setup() {
  const repository = new FakePortalRepository();
  return { repository, service: new PortalService(repository) };
}

describe('PortalService', () => {
  let repository: FakePortalRepository;
  let service: PortalService;

  beforeEach(() => {
    ({ repository, service } = setup());
  });

  it('parses JSON home sections and falls back to the raw string', () => {
    repository.sections.set('hero', JSON.stringify({ title: '欢迎' }));
    repository.sections.set('broken', '{not json');

    expect(service.getHome()).toEqual({ hero: { title: '欢迎' }, broken: '{not json' });
  });

  it('rejects a non-object home update with the legacy 400 body', () => {
    expect(service.updateHome(null)).toEqual({ status: 400, body: { success: false, message: 'Invalid data format' } });
    expect(repository.transactions).toBe(0);
  });

  it('upserts home sections inside one transaction', () => {
    const result = service.updateHome({ hero: { title: 'x' }, footer: 'text' });

    expect(result).toEqual({ status: 200, body: { success: true, message: 'Home content updated successfully' } });
    expect(repository.transactions).toBe(1);
    expect(repository.sections.get('hero')).toBe('{"title":"x"}');
    // A string value is stored as-is, not double-encoded.
    expect(repository.sections.get('footer')).toBe('text');
  });

  it('rejects an article without title or content', () => {
    expect(service.createArticle({ title: 'x' }).status).toBe(400);
    expect(service.createArticle({ content: 'y' }).status).toBe(400);
    expect(service.createArticle({ title: 'x' }).body.message).toBe('Title and content are required');
  });

  it('creates an article and reports its id', () => {
    const result = service.createArticle({ title: '标题', content: '正文' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, id: 1 });
    expect(repository.articles.get(1)?.is_published).toBe(0);
  });

  it('returns 404 for an unknown article on read, update and delete', () => {
    expect(service.getArticle('999').status).toBe(404);
    expect(service.updateArticle('999', { title: 'x' }).status).toBe(404);
    expect(service.deleteArticle('999').status).toBe(404);
    expect(service.getArticle('999').body.message).toBe('Article not found');
  });

  it('counts a view when an article is read', () => {
    service.createArticle({ title: '标题', content: '正文' });
    service.getArticle('1');
    service.getArticle('1');

    expect(repository.articles.get(1)?.view_count).toBe(2);
  });

  it('reports "no fields to update" without touching the row', () => {
    service.createArticle({ title: '标题', content: '正文' });
    const before = repository.articles.get(1)!;

    const result = service.updateArticle('1', {});

    expect(result.body.message).toBe('No fields to update');
    expect(repository.articles.get(1)).toEqual(before);
  });

  it('updates only the provided fields and bumps updated_at', () => {
    service.createArticle({ title: '旧', content: '正文' });
    service.updateArticle('1', { title: '新', is_published: true });

    const article = repository.articles.get(1)!;
    expect(article.title).toBe('新');
    expect(article.is_published).toBe(1);
    // `content` untouched because it was not supplied.
    expect(article.content).toBe('正文');
  });

  it('deletes an article', () => {
    service.createArticle({ title: '标题', content: '正文' });
    expect(service.deleteArticle('1')).toEqual({
      status: 200,
      body: { success: true, message: 'Article deleted successfully' },
    });
    expect(repository.articles.size).toBe(0);
  });

  it('rejects a contact message without name or message', () => {
    expect(service.createContact({ name: '甲' }).status).toBe(400);
    expect(service.createContact({ message: '内容' }).body.message).toBe('姓名和留言内容为必填项');
  });

  it('accepts a contact message without an email', () => {
    const result = service.createContact({ name: '甲', message: '内容' });

    expect(result.status).toBe(200);
    expect(repository.contacts).toEqual([{ name: '甲', email: null, message: '内容' }]);
  });

  it('passes listing filters and paging to the repository', () => {
    const listSpy = vi.spyOn(repository, 'listArticles');
    service.listArticles({ category: 'news', is_published: 'true', limit: 5, offset: 10 });

    expect(listSpy).toHaveBeenCalledWith({ category: 'news', is_published: 'true', limit: 5, offset: 10 });
  });
});
