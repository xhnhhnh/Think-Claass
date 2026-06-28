import { Injectable } from '@nestjs/common';

import db from '../../db.js';

@Injectable()
export class PortalService {
  getHome() {
    const sections = db.prepare('SELECT section_key, content_json FROM homepage_content').all() as { section_key: string; content_json: string }[];
    const data: Record<string, any> = {};
    for (const section of sections) {
      try {
        data[section.section_key] = JSON.parse(section.content_json);
      } catch {
        data[section.section_key] = section.content_json;
      }
    }
    return data;
  }

  updateHome(input: unknown) {
    if (!input || typeof input !== 'object') {
      return { status: 400, body: { success: false, message: 'Invalid data format' } };
    }

    const transaction = db.transaction((updates: Record<string, any>) => {
      const stmt = db.prepare(
        'INSERT INTO homepage_content (section_key, content_json) VALUES (?, ?) ON CONFLICT(section_key) DO UPDATE SET content_json = excluded.content_json',
      );
      for (const [key, value] of Object.entries(updates)) {
        const contentJson = typeof value === 'string' ? value : JSON.stringify(value);
        stmt.run(key, contentJson);
      }
    });

    transaction(input as Record<string, any>);
    return { status: 200, body: { success: true, message: 'Home content updated successfully' } };
  }

  listArticles(queryInput: Record<string, any>) {
    const { category, is_published, limit = 10, offset = 0 } = queryInput ?? {};
    let query = 'SELECT id, title, summary, cover_image, category, is_published, view_count, created_at, updated_at FROM articles WHERE 1=1';
    const params: any[] = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (is_published !== undefined) {
      query += ' AND is_published = ?';
      params.push(is_published === 'true' || is_published === '1' ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const articles = db.prepare(query).all(...params);

    let countQuery = 'SELECT COUNT(*) as total FROM articles WHERE 1=1';
    const countParams: any[] = [];
    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }
    if (is_published !== undefined) {
      countQuery += ' AND is_published = ?';
      countParams.push(is_published === 'true' || is_published === '1' ? 1 : 0);
    }
    const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

    return { articles, total };
  }

  getArticle(id: string) {
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    if (!article) return { status: 404, body: { success: false, message: 'Article not found' } };

    db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(id);
    return { status: 200, body: { success: true, article } };
  }

  createArticle(input: Record<string, any>) {
    const { title, summary, content, cover_image, category, is_published = 0 } = input ?? {};
    if (!title || !content) {
      return { status: 400, body: { success: false, message: 'Title and content are required' } };
    }

    const info = db
      .prepare(
        `
      INSERT INTO articles (title, summary, content, cover_image, category, is_published)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(title, summary || null, content, cover_image || null, category || null, is_published ? 1 : 0);

    return { status: 200, body: { success: true, message: 'Article created successfully', id: info.lastInsertRowid } };
  }

  updateArticle(id: string, input: Record<string, any>) {
    const { title, summary, content, cover_image, category, is_published } = input ?? {};

    const existing = db.prepare('SELECT id FROM articles WHERE id = ?').get(id);
    if (!existing) return { status: 404, body: { success: false, message: 'Article not found' } };

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (summary !== undefined) {
      updates.push('summary = ?');
      params.push(summary);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }
    if (cover_image !== undefined) {
      updates.push('cover_image = ?');
      params.push(cover_image);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    if (is_published !== undefined) {
      updates.push('is_published = ?');
      params.push(is_published ? 1 : 0);
    }

    if (updates.length === 0) {
      return { status: 200, body: { success: true, message: 'No fields to update' } };
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    db.prepare(`UPDATE articles SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    return { status: 200, body: { success: true, message: 'Article updated successfully' } };
  }

  deleteArticle(id: string) {
    const info = db.prepare('DELETE FROM articles WHERE id = ?').run(id);
    if (info.changes === 0) return { status: 404, body: { success: false, message: 'Article not found' } };
    return { status: 200, body: { success: true, message: 'Article deleted successfully' } };
  }

  createContact(input: Record<string, any>) {
    const { name, email, message } = input ?? {};
    if (!name || !message) {
      return { status: 400, body: { success: false, message: '姓名和留言内容为必填项' } };
    }

    const info = db
      .prepare(
        `
      INSERT INTO contact_messages (name, email, message)
      VALUES (?, ?, ?)
    `,
      )
      .run(name, email || null, message);

    return { status: 200, body: { success: true, message: '留言提交成功', id: info.lastInsertRowid } };
  }
}
