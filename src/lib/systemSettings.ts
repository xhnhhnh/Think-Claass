/**
 * Frontend copy of the system-settings defaults.
 *
 * The frontend cannot import `@thinkclass/kernel` (that would pull express and
 * better-sqlite3 into the browser bundle) and `packages/contracts` is type-only,
 * so this is the browser-side copy. `tests/guardrails/system-settings-parity.test.ts`
 * asserts it stays identical to the backend copy.
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
