import crypto from 'crypto';

import { ApiError } from '../../utils/apiError.js';
import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  PaymentEnvironment,
  PaymentProvider,
  PaymentProviderConfig,
  VerifyWebhookResult,
} from './index.js';

function requireConfig(config: PaymentProviderConfig, key: keyof PaymentProviderConfig, label: string) {
  const value = config[key];
  if (!value || String(value).trim() === '') {
    throw new ApiError(400, `微信支付未配置：${label}`);
  }
  return String(value);
}

function normalizePrivateKey(value: string) {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function getHeader(headers: Record<string, string | string[] | undefined>, key: string) {
  const value = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export class WechatPaymentProvider implements PaymentProvider {
  constructor(
    private readonly environment: PaymentEnvironment = 'production',
    private readonly config: PaymentProviderConfig = {},
  ) {}

  private getConfig() {
    return {
      appId: requireConfig(this.config, 'appId', 'AppID'),
      mchId: requireConfig(this.config, 'mchId', '商户号'),
      serialNo: requireConfig(this.config, 'serialNo', '商户证书序列号'),
      privateKey: normalizePrivateKey(requireConfig(this.config, 'privateKey', '商户 API 私钥')),
      apiV3Key: requireConfig(this.config, 'apiV3Key', 'API v3 密钥'),
    };
  }

  private sign(method: string, urlPath: string, body: string, timestamp: string, nonce: string) {
    const privateKey = this.getConfig().privateKey;
    const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
    return crypto.createSign('RSA-SHA256').update(message).sign(privateKey, 'base64');
  }

  private decryptResource(resource: Record<string, unknown>) {
    const apiV3Key = this.getConfig().apiV3Key;
    const associatedData = String(resource.associated_data ?? '');
    const nonce = String(resource.nonce ?? '');
    const ciphertext = String(resource.ciphertext ?? '');
    const buffer = Buffer.from(ciphertext, 'base64');
    const authTag = buffer.subarray(buffer.length - 16);
    const data = buffer.subarray(0, buffer.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), nonce);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associatedData));
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as Record<string, unknown>;
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
    const config = this.getConfig();
    const urlPath = '/v3/pay/transactions/native';
    const body = JSON.stringify({
      appid: config.appId,
      mchid: config.mchId,
      description: input.description,
      out_trade_no: input.orderNo,
      notify_url: input.notifyUrl,
      amount: {
        total: Math.round(input.amount * 100),
        currency: 'CNY',
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const signature = this.sign('POST', urlPath, body, timestamp, nonce);
    const authorization = [
      'WECHATPAY2-SHA256-RSA2048',
      `mchid="${config.mchId}"`,
      `nonce_str="${nonce}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${config.serialNo}"`,
      `signature="${signature}"`,
    ].join(',');

    const response = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
        'User-Agent': 'Think-Class/1.0',
      },
      body,
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof result.code_url !== 'string') {
      throw new ApiError(response.status || 502, `微信支付下单失败：${String(result.message ?? result.code ?? response.statusText)}`);
    }

    return {
      provider: 'wechat',
      channelOrderId: input.orderNo,
      qrCodeUrl: result.code_url,
      paymentUrl: result.code_url,
      payload: {
        environment: this.environment,
        providerMode: 'wechat-native-v3',
        method: 'wechat',
        orderNo: input.orderNo,
      },
    };
  }

  async verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
  ): Promise<VerifyWebhookResult> {
    const timestamp = getHeader(headers, 'wechatpay-timestamp');
    const nonce = getHeader(headers, 'wechatpay-nonce');
    const signature = getHeader(headers, 'wechatpay-signature');
    if (!timestamp || !nonce || !signature) {
      return { valid: false, payload: body };
    }

    const resource = body.resource;
    if (!resource || typeof resource !== 'object') {
      return { valid: false, payload: body };
    }

    const decrypted = this.decryptResource(resource as Record<string, unknown>);
    return {
      valid: true,
      orderNo: typeof decrypted.out_trade_no === 'string' ? decrypted.out_trade_no : undefined,
      providerTradeNo: typeof decrypted.transaction_id === 'string' ? decrypted.transaction_id : undefined,
      tradeStatus: typeof decrypted.trade_state === 'string' ? decrypted.trade_state : undefined,
      payload: { raw: body, decrypted },
    };
  }
}
