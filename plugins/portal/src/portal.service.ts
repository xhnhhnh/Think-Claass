/**
 * Portal service.
 *
 * Behaviour is relocated from `api/modules/portal/portal.service.ts`. The service keeps
 * its historical `{ status, body }` return shape and the controller turns a >= 400
 * status into an HTTP exception, because the exact statuses and messages are the API
 * contract - rewriting them into thrown errors would be a behaviour change dressed up as
 * a cleanup.
 *
 * No dependency on `classroom.public`: nothing here touches students or classes, so the
 * plugin declares no `dependsOn`. An unused dependency would make it fail to start when
 * classroom is absent, for no reason.
 */

import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { ArticleQuery, LegacyResult, PortalRepository } from './portal.types.js';

export class PortalService {
  constructor(private readonly repository: PortalRepository) {}

  getHome(): Record<string, unknown> {
    const sections = this.repository.listHomeSections();
    const data: Record<string, unknown> = {};
    for (const section of sections) {
      try {
        data[section.section_key] = JSON.parse(section.content_json);
      } catch {
        // A section whose JSON is malformed is served as its raw string rather than
        // breaking the whole homepage - preserved from the original.
        data[section.section_key] = section.content_json;
      }
    }
    return data;
  }

  /**
   * Bulk upsert of home sections.
   *
   * The repository owns the transaction: it is the layer that holds the `DbApi`, and
   * keeping it there means the service cannot accidentally run the upsert outside one.
   */
  updateHome(input: unknown): LegacyResult {
    if (!input || typeof input !== 'object') {
      return { status: 400, body: { success: false, message: 'Invalid data format' } };
    }

    this.repository.upsertHomeSections(input as Record<string, unknown>);
    return { status: 200, body: { success: true, message: 'Home content updated successfully' } };
  }

  listArticles(queryInput: ArticleQuery): { articles: unknown; total: number } {
    return this.repository.listArticles(queryInput ?? {});
  }

  getArticle(id: string): LegacyResult {
    const article = this.repository.getArticle(id);
    if (!article) return { status: 404, body: { success: false, message: 'Article not found' } };

    this.repository.incrementArticleViews(id);
    return { status: 200, body: { success: true, article } };
  }

  createArticle(input: Record<string, unknown>): LegacyResult {
    const { title, summary, content, cover_image, category, is_published = 0 } = input ?? {};
    if (!title || !content) {
      return { status: 400, body: { success: false, message: 'Title and content are required' } };
    }

    const id = this.repository.createArticle({
      title: String(title),
      summary: summary ? String(summary) : null,
      content: String(content),
      cover_image: cover_image ? String(cover_image) : null,
      category: category ? String(category) : null,
      is_published: is_published ? 1 : 0,
    });

    return { status: 200, body: { success: true, message: 'Article created successfully', id } };
  }

  updateArticle(id: string, input: Record<string, unknown>): LegacyResult {
    const { title, summary, content, cover_image, category, is_published } = input ?? {};

    if (!this.repository.articleExists(id)) {
      return { status: 404, body: { success: false, message: 'Article not found' } };
    }

    const fields: Record<string, string | number> = {};
    if (title !== undefined) fields.title = String(title);
    if (summary !== undefined) fields.summary = String(summary);
    if (content !== undefined) fields.content = String(content);
    if (cover_image !== undefined) fields.cover_image = String(cover_image);
    if (category !== undefined) fields.category = String(category);
    if (is_published !== undefined) fields.is_published = is_published ? 1 : 0;

    if (Object.keys(fields).length === 0) {
      return { status: 200, body: { success: true, message: 'No fields to update' } };
    }

    this.repository.updateArticle(id, fields);
    return { status: 200, body: { success: true, message: 'Article updated successfully' } };
  }

  deleteArticle(id: string): LegacyResult {
    if (this.repository.deleteArticle(id) === 0) {
      return { status: 404, body: { success: false, message: 'Article not found' } };
    }
    return { status: 200, body: { success: true, message: 'Article deleted successfully' } };
  }

  createContact(input: Record<string, unknown>): LegacyResult {
    const { name, email, message } = input ?? {};
    if (!name || !message) {
      return { status: 400, body: { success: false, message: '姓名和留言内容为必填项' } };
    }

    const id = this.repository.createContact({
      name: String(name),
      email: email ? String(email) : null,
      message: String(message),
    });

    return { status: 200, body: { success: true, message: '留言提交成功', id } };
  }
}
