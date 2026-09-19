/**
 * Portal domain types.
 *
 * `articles`, `homepage_content` and `contact_messages` are the plugin's own tables
 * (declared under `data.adopted` because they keep their legacy names).
 */

export interface ArticleRow {
  id: number;
  title: string;
  summary: string | null;
  content: string;
  cover_image: string | null;
  category: string | null;
  is_published: number;
  view_count: number;
  created_at: string;
  updated_at: string;
}

/** A listing omits `content`; the single-article read returns the whole row. */
export type ArticleSummaryRow = Omit<ArticleRow, 'content'>;

export interface ArticleQuery {
  category?: string;
  is_published?: string;
  limit?: number | string;
  offset?: number | string;
}

/**
 * The service's historical result shape: status and body are returned as data and the
 * controller turns a >= 400 status into an HTTP exception. Kept verbatim - the statuses
 * and messages are part of the API contract.
 */
export interface LegacyResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PortalRepository {
  listHomeSections(): Array<{ section_key: string; content_json: string }>;
  /**
   * Bulk upsert of home sections, in one transaction.
   *
   * The repository owns the transaction because it holds the `DbApi`; putting it here
   * means a caller cannot run the upsert outside one by omission.
   */
  upsertHomeSections(updates: Record<string, unknown>): void;
  listArticles(query: ArticleQuery): { articles: ArticleSummaryRow[]; total: number };
  getArticle(id: string): ArticleRow | null;
  incrementArticleViews(id: string): void;
  createArticle(input: {
    title: string;
    summary: string | null;
    content: string;
    cover_image: string | null;
    category: string | null;
    is_published: number;
  }): number;
  articleExists(id: string): boolean;
  updateArticle(id: string, fields: Record<string, string | number>): void;
  deleteArticle(id: string): number;
  createContact(input: { name: string; email: string | null; message: string }): number;
}
