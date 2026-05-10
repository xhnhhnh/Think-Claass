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
} from '@/shared/admin/contracts';

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
