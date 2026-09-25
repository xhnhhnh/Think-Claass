/**
 * admin domain contracts.
 *
 * Moved from `src/shared/admin/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { HomeworkAiState } from './homework.js';

export type AdminRole = 'admin' | 'superadmin';

export interface AdminActor {
  id: number;
  role: AdminRole;
  username: string;
}

export interface AdminSession {
  user: AdminActor;
  /**
   * Opaque session token issued by the kernel. Optional because the field is
   * additive: an older server, or the admin service used directly, may not set it.
   */
  token?: string;
  expiresAt?: string;
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
  draftArticles?: number;
  inactiveTeachers?: number;
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
  payment_notify_url: string;
  payment_wechat_appid: string;
  payment_wechat_mchid: string;
  payment_wechat_serial_no: string;
  payment_wechat_private_key: string;
  payment_wechat_api_v3_key: string;
  payment_alipay_app_id: string;
  payment_alipay_private_key: string;
  payment_alipay_public_key: string;
  payment_alipay_gateway: string;
  /**
   * The homework AI provider (see `plugins/homework/src/homework.ai.ts`).
   *
   * These keys live in the platform's canonical settings list because the model connection is
   * operator policy rather than a per-teacher choice - the same status as the payment channel keys
   * above. The homework plugin reads them through the read-only `ctx.settings.getPlatform`
   * accessor, so it never writes a key it does not own, and this console is the only writer.
   *
   * `ai_provider` defaults to `mock`, and that default is a working configuration rather than a
   * placeholder: a deployment with no model configured still grades objective questions
   * deterministically and says so on every AI surface instead of failing. Setting it to `http`
   * requires `ai_base_url` and `ai_api_key`, without which the provider refuses to construct and the
   * feature degrades back to the mock with the reason attached.
   */
  ai_provider: string;
  ai_base_url: string;
  ai_api_key: string;
  ai_model: string;
  ai_timeout_ms: string;
}

/**
 * The console's AI panel: the provider the `ai_*` settings resolve to, and what a live test said.
 *
 * `state` is reused from the homework domain because it *is* that plugin's answer - the console adds
 * only the round trip's outcome. `state.provider` is the resolved source, so a half-configured `http`
 * shows up as `mock` with `reason` set, and `unavailable` means the optional homework plugin is not
 * installed at all - a case the panel must render as a sentence rather than as a failure.
 *
 * `ok: false` travels inside a 200 on purpose: an unreachable model is something the operator reads
 * and acts on, not a request that failed.
 */
export interface AiConnectionTestResult {
  state: HomeworkAiState;
  ok: boolean;
  message: string;
}


export interface DatabaseImportResult {
  message: string;
  reloaded: boolean;
  backupRestored: boolean;
}

export interface DatabaseResetResult {
  message: string;
  preservedSuperadmins: number;
}

export type ReleaseUpdateState = 'idle' | 'running' | 'succeeded' | 'failed';

export interface ReleaseUpdateStatus {
  repo: string;
  supported: boolean;
  platform: string;
  state: ReleaseUpdateState;
  message: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean | null;
  releaseUrl: string;
  downloadUrl: string;
  startedAt: string | null;
  updatedAt: string | null;
  log: string;
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
