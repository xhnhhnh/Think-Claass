/**
 * `api/website` route authorization.
 *
 * The portal's split is a product decision and this suite pins both halves of it:
 *
 *   - the public marketing routes (`GET home`, `GET articles`, `GET articles/:id`, `POST contact`)
 *     must keep answering **without a credential** - `HomePage`, `NewsPage` and `ContactPage` call
 *     them before anyone logs in;
 *   - the editor routes (`PUT home`, `POST|PUT|DELETE articles*`) must refuse anonymous callers with
 *     401 and every non-admin role with 403. They were anonymous, so an unnamed visitor could
 *     rewrite the homepage, publish articles or delete every one of them.
 *
 * Every handler in this controller is synchronous, which is exactly why `refused()` exists: a
 * synchronous throw must not escape the assertion.
 */

import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { WebsiteController } from '../../plugins/portal/src/portal.controllers.js';
import { PortalService } from '../../plugins/portal/src/portal.service.js';
import type { PortalRepository } from '../../plugins/portal/src/portal.types.js';

function request(actor: { userId: number; role: string } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'bearer' : 'none' } } as unknown as Request;
}

async function refused(run: () => unknown): Promise<any> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to be refused, but it resolved');
}

function build() {
  const sections = new Map<string, string>();
  const articles = new Map<number, Record<string, unknown>>();
  const contacts: Array<Record<string, unknown>> = [];
  let nextId = 1;

  const repository = {
    listHomeSections: () => [...sections].map(([section_key, content_json]) => ({ section_key, content_json })),
    upsertHomeSections(updates: Record<string, unknown>) {
      for (const [key, value] of Object.entries(updates)) sections.set(key, JSON.stringify(value));
    },
    listArticles: () => ({ articles: [...articles.values()], total: articles.size }),
    getArticle: (id: string) => articles.get(Number(id)) ?? null,
    incrementArticleViews: () => {},
    createArticle(input: Record<string, unknown>) {
      const id = nextId++;
      articles.set(id, { id, ...input });
      return id;
    },
    articleExists: (id: string) => articles.has(Number(id)),
    updateArticle: (id: string, fields: Record<string, unknown>) => {
      articles.set(Number(id), { ...articles.get(Number(id)), ...fields });
    },
    deleteArticle: (id: string) => (articles.delete(Number(id)) ? 1 : 0),
    createContact(input: Record<string, unknown>) {
      contacts.push(input);
      return nextId++;
    },
  } as unknown as PortalRepository;

  return { controller: new WebsiteController(new PortalService(repository)), articles, contacts };
}

const EDITOR_ROUTES: Array<{ label: string; invoke: (controller: WebsiteController, req: Request) => unknown }> = [
  { label: 'PUT /api/website/home', invoke: (c, req) => c.updateHome(req, { hero: { title: 'x' } }) },
  { label: 'POST /api/website/articles', invoke: (c, req) => c.createArticle(req, { title: 't', content: 'c' }) },
  { label: 'PUT /api/website/articles/:id', invoke: (c, req) => c.updateArticle(req, '1', { title: 't2' }) },
  { label: 'DELETE /api/website/articles/:id', invoke: (c, req) => c.deleteArticle(req, '1') },
];

describe('portal: the editor routes refuse anonymous callers with 401', () => {
  for (const route of EDITOR_ROUTES) {
    it(`${route.label} answers 401 without any credential`, async () => {
      const { controller } = build();

      const error = await refused(() => route.invoke(controller, request(null)));

      expect(error).toMatchObject({ status: 401, message: '未登录或登录已过期' });
    });
  }
});

describe('portal: the editor routes refuse every non-admin role with 403', () => {
  for (const route of EDITOR_ROUTES) {
    it(`${route.label} answers 403 for a student and for a teacher`, async () => {
      const { controller } = build();

      for (const role of ['student', 'teacher', 'parent']) {
        const error = await refused(() => route.invoke(controller, request({ userId: 9, role })));
        expect(error).toMatchObject({ status: 403, message: '无权限执行该操作' });
      }
    });
  }

  it('lets an admin edit the homepage', async () => {
    const { controller } = build();

    expect(await controller.updateHome(request({ userId: 1, role: 'admin' }), { hero: { title: '新首页' } })).toMatchObject({
      success: true,
    });
  });

  it('lets a superadmin delete an article', async () => {
    const { controller, articles } = build();

    await controller.createArticle(request({ userId: 2, role: 'superadmin' }), { title: 't', content: 'c' });
    expect(articles.size).toBe(1);

    expect(await controller.deleteArticle(request({ userId: 2, role: 'superadmin' }), '1')).toMatchObject({
      success: true,
    });
    expect(articles.size).toBe(0);
  });
});

describe('portal: the public routes stay public', () => {
  it('GET /api/website/home answers anonymously', async () => {
    const { controller } = build();

    expect(await controller.getHome()).toEqual({ success: true, data: {} });
  });

  it('GET /api/website/articles answers anonymously', async () => {
    const { controller } = build();

    expect(await controller.listArticles({})).toMatchObject({ success: true, total: 0 });
  });

  it('GET /api/website/articles/:id answers anonymously', async () => {
    const { controller } = build();
    // Written by an admin, read by nobody in particular.
    await controller.createArticle(request({ userId: 1, role: 'admin' }), { title: '公开文章', content: '正文' });

    expect(await controller.getArticle('1')).toMatchObject({ success: true, article: { title: '公开文章' } });
  });

  it('POST /api/website/contact answers anonymously', async () => {
    const { controller, contacts } = build();

    expect(await controller.createContact({ name: '访客', message: '你好' })).toMatchObject({ success: true });
    expect(contacts).toHaveLength(1);
  });
});
