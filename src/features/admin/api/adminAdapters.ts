import type {
  ActivationCodeListItem,
  AdminAnnouncementListItem,
  ArticleListItem,
  AuditLogListItem,
  OpenApiKeyListItem,
  OpenSchoolListItem,
  TeacherDetail,
  TeacherListItem,
  WebsiteSettingsDto,
} from '@/shared/admin/contracts';

function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function toBooleanValue(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function toNumberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function mapTeacher(item: Record<string, unknown>): TeacherDetail {
  return {
    id: toNumberValue(item.id),
    username: toStringValue(item.username),
    role: 'teacher',
    isActivated: Boolean(item.isActivated ?? toBooleanValue(item.is_activated)),
  };
}

export function mapActivationCode(item: Record<string, unknown>): ActivationCodeListItem {
  return {
    id: toNumberValue(item.id),
    code: toStringValue(item.code),
    status: toStringValue(item.status, 'unused'),
    usedByUserId: typeof item.usedByUserId === 'number' ? item.usedByUserId : typeof item.used_by === 'number' ? item.used_by : null,
    usedByUsername:
      typeof item.usedByUsername === 'string'
        ? item.usedByUsername
        : typeof item.used_by_username === 'string'
          ? item.used_by_username
          : null,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : null,
    usedAt: typeof item.usedAt === 'string' ? item.usedAt : typeof item.used_at === 'string' ? item.used_at : null,
    activationSource:
      typeof item.activationSource === 'string'
        ? item.activationSource
        : typeof item.activation_source === 'string'
          ? item.activation_source
          : null,
    activationRemark:
      typeof item.activationRemark === 'string'
        ? item.activationRemark
        : typeof item.activation_remark === 'string'
          ? item.activation_remark
          : null,
  };
}

export function mapAdminAnnouncement(item: Record<string, unknown>): AdminAnnouncementListItem {
  return {
    id: toNumberValue(item.id),
    title: toStringValue(item.title),
    content: toStringValue(item.content),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : null,
    isActive: Boolean(item.isActive ?? toBooleanValue(item.is_active)),
  };
}

export function mapWebsiteSettings(item: Record<string, unknown>): WebsiteSettingsDto {
  const hero = (item.hero as Record<string, unknown> | undefined) ?? {};
  const about = (item.about as Record<string, unknown> | undefined) ?? {};
  const features = Array.isArray(item.features) ? item.features : [];

  return {
    hero: {
      title: toStringValue(hero.title),
      subtitle: toStringValue(hero.subtitle),
      buttonText: toStringValue(hero.buttonText),
    },
    features: features.filter((feature): feature is Record<string, unknown> => typeof feature === 'object' && feature !== null),
    about: {
      title: toStringValue(about.title),
      content: toStringValue(about.content),
    },
  };
}

export function mapArticle(item: Record<string, unknown>): ArticleListItem {
  return {
    id: toNumberValue(item.id),
    title: toStringValue(item.title),
    summary: toStringValue(item.summary),
    content: toStringValue(item.content),
    coverImage: toStringValue(item.coverImage ?? item.cover_image),
    category: toStringValue(item.category, '其他'),
    isPublished: toBooleanValue(item.isPublished ?? item.is_published),
    viewCount: toNumberValue(item.viewCount ?? item.view_count),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : null,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.updated_at === 'string' ? item.updated_at : null,
  };
}

export function mapAuditLog(item: Record<string, unknown>): AuditLogListItem {
  return {
    id: toNumberValue(item.id),
    teacherId: typeof item.teacherId === 'number' ? item.teacherId : typeof item.teacher_id === 'number' ? item.teacher_id : null,
    userId: typeof item.userId === 'number' ? item.userId : typeof item.user_id === 'number' ? item.user_id : null,
    action: toStringValue(item.action),
    details: toStringValue(item.details),
    ipAddress: toStringValue(item.ipAddress ?? item.ip_address),
    role: typeof item.role === 'string' ? item.role : null,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : null,
  };
}

export function mapOpenApiKey(item: Record<string, unknown>): OpenApiKeyListItem {
  return {
    id: toNumberValue(item.id),
    name: toStringValue(item.name),
    apiKey: toStringValue(item.apiKey ?? item.api_key ?? item.key),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : null,
    lastUsedAt:
      typeof item.lastUsedAt === 'string' ? item.lastUsedAt : typeof item.last_used_at === 'string' ? item.last_used_at : null,
    isActive: toBooleanValue(item.isActive ?? item.is_active),
  };
}

export function mapSchool(item: Record<string, unknown>): OpenSchoolListItem {
  return {
    id: toNumberValue(item.id),
    name: toStringValue(item.name),
    description: toStringValue(item.description),
    contactInfo: toStringValue(item.contactInfo ?? item.contact_info),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : null,
  };
}

export function mapTeacherList(items: unknown[]): TeacherListItem[] {
  return items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(mapTeacher);
}
