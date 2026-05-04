export interface HomeContentDto {
  hero?: {
    title?: string;
    subtitle?: string;
    buttonText?: string;
  };
  features?: Array<Record<string, unknown>>;
  about?: {
    title?: string;
    content?: string;
  };
  [key: string]: unknown;
}

export interface ArticleDto {
  id: number;
  title: string;
  summary: string | null;
  content: string;
  cover_image: string | null;
  category: string | null;
  is_published: number;
  view_count: number;
  created_at: string;
  updated_at?: string | null;
}

export interface ArticleListQuery {
  category?: string;
  is_published?: boolean | number | string;
  limit?: number;
  offset?: number;
}

export interface ArticlePayload {
  title: string;
  summary?: string;
  content: string;
  cover_image?: string;
  category?: string;
  is_published?: boolean | number;
}

export interface ContactMessagePayload {
  name: string;
  email?: string;
  message: string;
}
