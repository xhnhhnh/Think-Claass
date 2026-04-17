export type AdminRole = 'admin' | 'superadmin';

export interface AdminActor {
  id: number;
  role: AdminRole;
  username: string;
}

export interface AdminSession {
  user: AdminActor;
}

export interface SystemServerStats {
  cpuUsage: number;
  cpuCount: number;
  totalMem: number;
  usedMem: number;
  freeMem: number;
  memUsage: number;
  uptime: number;
  platform: string;
}

export interface SystemDatabaseStats {
  totalUsers: number;
  teachers: number;
  students: number;
  classes: number;
  totalActivity: number;
  totalAssignments: number;
  totalLeaves: number;
  totalTeamQuests: number;
  totalPoints: number;
}

export interface SystemStatsResponse {
  server: SystemServerStats;
  database: SystemDatabaseStats;
}

export interface SystemSettings {
  site_title: string;
  site_favicon: string;
  allow_teacher_registration: string;
  revenue_enabled: string;
  revenue_mode: string;
  enable_teacher_analytics: string;
  enable_parent_report: string;
  payment_price: string;
  payment_currency: string;
  payment_description: string;
  payment_environment: string;
  payment_enable_wechat: string;
  payment_enable_alipay: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  site_title: '',
  site_favicon: '',
  allow_teacher_registration: '0',
  revenue_enabled: '0',
  revenue_mode: 'activation_code',
  enable_teacher_analytics: '1',
  enable_parent_report: '1',
  payment_price: '99.00',
  payment_currency: 'CNY',
  payment_description: 'Think-Class 平台激活',
  payment_environment: 'mock',
  payment_enable_wechat: '1',
  payment_enable_alipay: '1',
};

export interface DatabaseImportResult {
  message: string;
  reloaded: boolean;
  backupRestored: boolean;
}

export interface DatabaseResetResult {
  message: string;
  preservedSuperadmins: number;
}

export interface AdminListResponse<T> {
  items: T[];
  total: number;
}

export interface AdminMutationResult {
  message: string;
}

export interface TeacherListItem {
  id: number;
  username: string;
  role: 'teacher';
  isActivated: boolean;
}

export type TeacherDetail = TeacherListItem;

export interface UpsertTeacherInput {
  username: string;
  password?: string;
}

export interface TeacherDeleteResult {
  message: string;
  deletedTeacherId: number;
  deletedClasses: number;
  deletedStudents: number;
  deletedStudentUsers: number;
}

export interface ActivationCodeListItem {
  id: number;
  code: string;
  status: string;
  usedByUserId: number | null;
  usedByUsername: string | null;
  createdAt: string | null;
  usedAt: string | null;
  activationSource: string | null;
  activationRemark: string | null;
}

export interface GenerateActivationCodesInput {
  count: number;
}

export interface GenerateActivationCodesResult {
  message: string;
  createdCount: number;
  codes: ActivationCodeListItem[];
}

export interface AdminAnnouncementListItem {
  id: number;
  title: string;
  content: string;
  createdAt: string | null;
  isActive: boolean;
}

export interface UpsertAdminAnnouncementInput {
  title: string;
  content: string;
  isActive: boolean;
}

export interface WebsiteHeroSection {
  title: string;
  subtitle: string;
  buttonText: string;
}

export interface WebsiteAboutSection {
  title: string;
  content: string;
}

export type WebsiteFeatureItem = Record<string, unknown>;

export interface WebsiteSettingsDto {
  hero: WebsiteHeroSection;
  features: WebsiteFeatureItem[];
  about: WebsiteAboutSection;
}

export interface ArticleListItem {
  id: number;
  title: string;
  summary: string;
  content: string;
  coverImage: string;
  category: string;
  isPublished: boolean;
  viewCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpsertArticleInput {
  title: string;
  summary: string;
  content: string;
  coverImage: string;
  category: string;
  isPublished: boolean;
}

export interface AuditLogListItem {
  id: number;
  teacherId: number | null;
  userId: number | null;
  action: string;
  details: string;
  ipAddress: string;
  role: string | null;
  createdAt: string | null;
}

export interface AuditLogQuery {
  teacherId?: number;
  userId?: number;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogListResponse {
  items: AuditLogListItem[];
  total: number;
}

export interface OpenApiKeyListItem {
  id: number;
  name: string;
  apiKey: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
}

export interface CreateOpenApiKeyInput {
  name: string;
}

export interface OpenSchoolListItem {
  id: number;
  name: string;
  description: string;
  contactInfo: string;
  createdAt: string | null;
}

export interface UpsertOpenSchoolInput {
  name: string;
  description: string;
  contactInfo: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  message: string;
}
