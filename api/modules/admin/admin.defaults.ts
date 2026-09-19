/**
 * Backend copy of the system-settings defaults, used by admin.repository.ts as the canonical key list and fallbacks for system_settings.
 *
 * Generated alongside the frontend copy from one source block; a parity test keeps
 * them in step. Becomes plugin-declared settings when the admin plugin lands (P4/P5).
 */

import type { SystemSettings } from '@thinkclass/contracts/domains/admin';

export type { SystemSettings } from '@thinkclass/contracts/domains/admin';

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
  payment_enable_wechat: '0',
  payment_enable_alipay: '0',
  payment_notify_url: '',
  payment_wechat_appid: '',
  payment_wechat_mchid: '',
  payment_wechat_serial_no: '',
  payment_wechat_private_key: '',
  payment_wechat_api_v3_key: '',
  payment_alipay_app_id: '',
  payment_alipay_private_key: '',
  payment_alipay_public_key: '',
  payment_alipay_gateway: 'https://openapi.alipay.com/gateway.do',
};
