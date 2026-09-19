/**
 * Portal repository.
 *
 * The SQL is relocated from `api/modules/portal/portal.service.ts` unchanged; only the
 * connection changes - `ctx.db` instead of the raw `api/db.ts` handle, so every
 * statement is checked against the tables the manifest declares.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

import type { ArticleQuery, ArticleRow, ArticleSummaryRow, PortalRepository } from './portal.types.js';

export function createPortalRepository(db: DbApi): PortalRepository {
  return {
    listHomeSections() {
      return db.query<{ section_key: string; content_json: string }>(
        `SELECT section_key, content_json FROM homepage_content`,
      );
    },

    upsertHomeSections(updates) {
      db.tx((tx) => {
        for (const [key, value] of Object.entries(updates)) {
          const contentJson = typeof value === 'string' ? value : JSON.stringify(value);
          tx.run(
            `INSERT INTO homepage_content (section_key, content_json) VALUES (?, ?)
               ON CONFLICT(section_key) DO UPDATE SET content_json = excluded.content_json`,
            [key, contentJson],
          );
        }
      });
    },

    listArticles(query) {
      const { category, is_published, limit = 10, offset = 0 } = query ?? {};

      // Two statements, one filter definition: building the WHERE clause once keeps the
      // page and the count from drifting apart, which is what the original duplicated.
      const filters: string[] = [];
      const filterParams: SqlParam[] = [];
      if (category) {
        filters.push('category = ?');
        filterParams.push(category);
      }
      if (is_published !== undefined) {
        filters.push('is_published = ?');
        filterParams.push(is_published === 'true' || is_published === '1' ? 1 : 0);
      }
      const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';

      const articles = db.query<ArticleSummaryRow>(
        `SELECT id, title, summary, cover_image, category, is_published, view_count, created_at, updated_at
           FROM articles${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...filterParams, Number(limit), Number(offset)],
      );

      const counted = db.get<{ total: number }>(`SELECT COUNT(*) as total FROM articles${where}`, filterParams);

      return { articles, total: counted?.total ?? 0 };
    },

    getArticle(id) {
      return db.get<ArticleRow>(`SELECT * FROM articles WHERE id = ?`, [id]) ?? null;
    },

    incrementArticleViews(id) {
      db.run(`UPDATE articles SET view_count = view_count + 1 WHERE id = ?`, [id]);
    },

    createArticle(input) {
      const result = db.run(
        `INSERT INTO articles (title, summary, content, cover_image, category, is_published)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.title, input.summary, input.content, input.cover_image, input.category, input.is_published],
      );
      return Number(result.lastInsertRowid);
    },

    articleExists(id) {
      return db.get<{ id: number }>(`SELECT id FROM articles WHERE id = ?`, [id]) !== undefined;
    },

    updateArticle(id, fields) {
      const updates = Object.keys(fields).map((column) => `${column} = ?`);
      updates.push('updated_at = CURRENT_TIMESTAMP');
      const params = [...Object.values(fields), id] as SqlParam[];
      db.run(`UPDATE articles SET ${updates.join(', ')} WHERE id = ?`, params);
    },

    deleteArticle(id) {
      return db.run(`DELETE FROM articles WHERE id = ?`, [id]).changes;
    },

    createContact(input) {
      const result = db.run(`INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`, [
        input.name,
        input.email,
        input.message,
      ]);
      return Number(result.lastInsertRowid);
    },
  };
}
