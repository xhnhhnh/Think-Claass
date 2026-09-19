/**
 * Backend copy of the system-settings defaults, and the canonical key list for `settings`.
 *
 * Moved verbatim from `api/modules/admin/admin.defaults.ts` (P4.3b.14). It is the *backend* half of a
 * pair: `src/lib/systemSettings.ts` carries the same block for the browser, and guardrail G9 keeps
 * the two in step (its `BACKEND` path constant was updated to this file when the domain moved).
 *
 * The list is the plugin's own business vocabulary, which is why it stays here and not in the
 * kernel: the kernel's `SettingsApi` stores and returns `key -> value` without knowing any of them.
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
