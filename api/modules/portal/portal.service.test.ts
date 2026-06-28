import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
  prepare: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn((fn: (...args: any[]) => unknown) => (...args: any[]) => fn(...args)),
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
    transaction: dbMocks.transaction,
  },
}));

import { PortalService } from './portal.service';

function mockPreparedStatement() {
  dbMocks.prepare.mockImplementation((sql: string) => ({
    all: (...args: unknown[]) => dbMocks.all(sql, ...args),
    get: (...args: unknown[]) => dbMocks.get(sql, ...args),
    run: (...args: unknown[]) => dbMocks.run(sql, ...args),
  }));
}

describe('PortalService', () => {
  let service: PortalService;

  beforeEach(() => {
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    dbMocks.transaction.mockImplementation((fn: (...args: any[]) => unknown) => (...args: any[]) => fn(...args));
    mockPreparedStatement();
    service = new PortalService();
  });

  it('keeps homepage JSON parsing and invalid update legacy response', () => {
    dbMocks.all.mockReturnValueOnce([
      { section_key: 'hero', content_json: '{"title":"Think Class"}' },
      { section_key: 'raw', content_json: 'plain text' },
    ]);

    expect(service.getHome()).toEqual({
      hero: { title: 'Think Class' },
      raw: 'plain text',
    });
    expect(service.updateHome(null)).toEqual({ status: 400, body: { success: false, message: 'Invalid data format' } });
  });

  it('keeps articles list filters, totals, and mutation legacy bodies', () => {
    dbMocks.all.mockReturnValueOnce([{ id: 1, title: 'A' }]);
    dbMocks.get.mockReturnValueOnce({ total: 1 });
    expect(service.listArticles({ category: 'news', is_published: '1', limit: '5', offset: '10' })).toEqual({
      articles: [{ id: 1, title: 'A' }],
      total: 1,
    });

    dbMocks.get.mockReturnValueOnce(undefined);
    expect(service.getArticle('99')).toEqual({ status: 404, body: { success: false, message: 'Article not found' } });

    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 7 });
    expect(service.createArticle({ title: 'A', content: 'body' })).toEqual({
      status: 200,
      body: { success: true, message: 'Article created successfully', id: 7 },
    });

    dbMocks.get.mockReturnValueOnce({ id: 7 });
    expect(service.updateArticle('7', {})).toEqual({ status: 200, body: { success: true, message: 'No fields to update' } });

    dbMocks.run.mockReturnValueOnce({ changes: 0 });
    expect(service.deleteArticle('7')).toEqual({ status: 404, body: { success: false, message: 'Article not found' } });
  });

  it('keeps contact validation and success body', () => {
    expect(service.createContact({ name: 'Ada' })).toEqual({
      status: 400,
      body: { success: false, message: '姓名和留言内容为必填项' },
    });

    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 3 });
    expect(service.createContact({ name: 'Ada', email: '', message: 'hi' })).toEqual({
      status: 200,
      body: { success: true, message: '留言提交成功', id: 3 },
    });
  });
});
