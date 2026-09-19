/**
 * platform domain contracts.
 *
 * Moved from `src/shared/platform/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

export type {
  ActivationCodeListItem as ActivationCodeDto,
  AdminAnnouncementListItem as AdminAnnouncementDto,
  AuditLogListItem as AuditLogDto,
  AuditLogQuery,
  OpenApiKeyListItem as OpenApiKeyDto,
  OpenSchoolListItem as SchoolDto,
  SystemSettings as PublicSettingsDto,
  TeacherListItem as AdminUserDto,
  UpsertAdminAnnouncementInput,
  UpsertOpenSchoolInput,
  UpsertTeacherInput,
} from './admin.js';

export type PaymentMethod = 'wechat' | 'alipay';

export interface PaymentOrderDto {
  orderNo: string;
  status: string;
  amount: number;
  currency: string;
  qrCodeUrl: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  environment: string;
  providerMode: string;
}
