/**
 * Alipay provider.
 *
 * This class used to be `extends MockPaymentProvider` with no other body: selecting `alipay` in
 * ANY environment - `production` included - returned `https://mock-pay.local/...` and accepted the
 * literal header `x-payment-signature: mock-valid-signature`. Together with the public
 * `POST /api/payment/notify` route that was a free-activation chain: create an order with
 * `method: 'alipay'`, then post a fake success webhook and `identity.activateUser` runs.
 *
 * A public default that looks like a channel is worse than no integration, because it looks like
 * one. So this provider now behaves like `WechatPaymentProvider`: it demands its credentials and
 * fails with a clear 400 when they are absent. The dev/mock path still exists, and it is chosen by
 * `payment_environment: 'mock'` in the factory - not by the absence of configuration.
 *
 * Implements the two Alipay OpenAPI v1 primitives this product needs, over plain HTTP + RSA2:
 *
 *   createOrder          -> alipay.trade.precreate (the QR-code product; no browser redirect)
 *   verifyWebhookSignature -> RSA2 verification of the async notify body against the Alipay public key
 *
 * Both follow Alipay's documented signing rules: parameters sorted by name, joined as
 * `k=v&k=v`, signed/verified with RSA-SHA256 ("RSA2"), signature itself excluded.
 */

import crypto from 'crypto';

import { ApiError } from '@thinkclass/kernel';

import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  PaymentEnvironment,
  PaymentProvider,
  PaymentProviderConfig,
  VerifyWebhookResult,
} from './index.js';

const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do';
const SIGN_TYPE = 'RSA2';

function requireConfig(config: PaymentProviderConfig, key: keyof PaymentProviderConfig, label: string) {
  const value = config[key];
  if (!value || String(value).trim() === '') {
    throw new ApiError(400, `支付宝未配置：${label}`);
  }
  return String(value);
}

/** Settings stored through the admin UI carry literal `\n`; the PEM parser needs real newlines. */
function normalizeKey(value: string) {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

/** Alipay's canonical string: sorted parameters, `k=v` joined by `&`, empty values kept. */
function canonicalize(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => key !== 'sign' && params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * `alipay_trade_precreate_response={"code":"10000",...}` followed by a signature line.
 *
 * Deliberately strict: an answer that is not this envelope is reported as a failure instead of
 * being mined for anything that looks like a code URL.
 */
function parseGatewayResponse(raw: string, node: string): Record<string, unknown> {
  const marker = `${node}=`;
  const start = raw.indexOf(marker);
  if (start < 0) {
    throw new ApiError(502, `支付宝返回无法解析：${raw.slice(0, 200)}`);
  }

  // Walk the JSON object so a `}` inside a string value cannot end it early.
  let depth = 0;
  let end = -1;
  let inString = false;
  for (let index = start + marker.length; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) {
    throw new ApiError(502, `支付宝返回无法解析：${raw.slice(0, 200)}`);
  }

  try {
    return JSON.parse(raw.slice(start + marker.length, end)) as Record<string, unknown>;
  } catch {
    throw new ApiError(502, `支付宝返回无法解析：${raw.slice(0, 200)}`);
  }
}

export class AlipayPaymentProvider implements PaymentProvider {
  constructor(
    private readonly environment: PaymentEnvironment = 'production',
    private readonly config: PaymentProviderConfig = {},
  ) {}

  private getConfig() {
    return {
      appId: requireConfig(this.config, 'appId', 'AppID'),
      privateKey: normalizeKey(requireConfig(this.config, 'privateKey', '应用私钥')),
      alipayPublicKey: normalizeKey(requireConfig(this.config, 'alipayPublicKey', '支付宝公钥')),
      gateway: this.config.gateway?.trim() ? this.config.gateway.trim() : DEFAULT_GATEWAY,
    };
  }

  private sign(params: Record<string, string>, privateKey: string) {
    return crypto.createSign('RSA-SHA256').update(canonicalize(params), 'utf8').sign(privateKey, 'base64');
  }

  /** Verify a signed parameter set against the Alipay public key. */
  private verifySignature(params: Record<string, string>, signature: string, alipayPublicKey: string) {
    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(canonicalize(params), 'utf8')
        .verify(alipayPublicKey, signature, 'base64');
    } catch {
      // A malformed key or signature is a failed verification, not a 500 for the caller.
      return false;
    }
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
    const config = this.getConfig();
    const params: Record<string, string> = {
      app_id: config.appId,
      method: 'alipay.trade.precreate',
      charset: 'utf-8',
      sign_type: SIGN_TYPE,
      timestamp: formatTimestamp(new Date()),
      version: '1.0',
      notify_url: input.notifyUrl,
      biz_content: JSON.stringify({
        out_trade_no: input.orderNo,
        total_amount: input.amount.toFixed(2),
        subject: input.description,
      }),
    };
    params.sign = this.sign(params, config.privateKey);

    const response = await fetch(config.gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams(params).toString(),
    });
    const raw = await response.text();

    const result = parseGatewayResponse(raw, 'alipay_trade_precreate_response');
    if (!response.ok || result.code !== '10000' || typeof result.qr_code !== 'string') {
      const reason = String(result.sub_msg ?? result.msg ?? response.statusText ?? response.status);
      throw new ApiError(502, `支付宝下单失败：${reason}`);
    }

    return {
      provider: 'alipay',
      channelOrderId: input.orderNo,
      qrCodeUrl: result.qr_code,
      paymentUrl: result.qr_code,
      payload: {
        environment: this.environment,
        providerMode: 'alipay-precreate-v1',
        method: 'alipay',
        orderNo: input.orderNo,
      },
    };
  }

  async verifyWebhookSignature(
    _headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
  ): Promise<VerifyWebhookResult> {
    const { alipayPublicKey } = this.getConfig();

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null || typeof value === 'object') continue;
      params[key] = String(value);
    }

    const signature = params.sign;
    if (!signature) {
      return { valid: false, payload: body };
    }

    const valid = this.verifySignature(params, signature, alipayPublicKey);
    if (!valid) {
      return { valid: false, payload: body };
    }

    return {
      valid: true,
      orderNo: params.out_trade_no,
      providerTradeNo: params.trade_no,
      tradeStatus: params.trade_status,
      payload: body,
    };
  }
}
