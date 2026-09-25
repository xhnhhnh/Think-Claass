/**
 * Frontend copy of the system-settings defaults.
 *
 * The frontend cannot import `@thinkclass/kernel` (that would pull express and
 * better-sqlite3 into the browser bundle) and `packages/contracts` is type-only,
 * so this is the browser-side copy. `tests/guardrails/system-settings-parity.test.ts`
 * asserts it stays identical to the backend copy.
 *
 * The object literal below is deliberately kept free of comments and of anything but
 * `key: 'value',` lines: the parity guard compares the two literals line by line, so anything added
 * inside the braces must be added to `plugins/admin/src/admin.defaults.ts` in exactly the same form.
 * Notes about individual keys belong in this header, where the guard does not look.
 *
 * The `ai_*` keys configure the homework AI provider (`plugins/homework/src/homework.ai.ts`).
 * `ai_provider` defaults to `mock`, which is a working configuration rather than a placeholder: it
 * grades objective questions deterministically and declines to judge what it cannot, so the AI
 * surfaces stay honest on an install with no model. `ai_api_key` is masked on the way out of
 * `GET /api/admin/system/settings` and the mask is never written back over the real key.
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
  ai_provider: 'mock',
  ai_base_url: '',
  ai_api_key: '',
  ai_model: 'deepseek-chat',
  ai_timeout_ms: '20000',
};

/**
 * The values `ai_provider` accepts, for the console's select.
 *
 * Exported from here rather than hardcoded in the settings page so the two names have one home: the
 * server's `resolveHomeworkProvider` treats anything that is not exactly `http` as the mock, so a
 * typo in a `<select>` value would silently grade with the mock while the form said the model was in
 * use. G9's parity guard only reads the `DEFAULT_SYSTEM_SETTINGS` literal above, so this constant is
 * free to live here.
 */
export const AI_PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'mock', label: '模拟判分（不调用外部模型）' },
  { value: 'http', label: 'OpenAI 兼容接口（需填写地址与密钥）' },
];
