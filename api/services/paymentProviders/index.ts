import { AlipayPaymentProvider } from './alipayProvider.js';
import { MockPaymentProvider } from './mockProvider.js';
import { WechatPaymentProvider } from './wechatProvider.js';

export type PaymentMethod = 'wechat' | 'alipay';
export type PaymentEnvironment = 'mock' | 'sandbox' | 'production';

export interface CreatePaymentOrderInput {
  orderNo: string;
  amount: number;
  description: string;
  method: PaymentMethod;
  notifyUrl: string;
}

export interface CreatePaymentOrderResult {
  provider: PaymentMethod;
  channelOrderId: string;
  qrCodeUrl: string;
  paymentUrl: string;
  payload: Record<string, unknown>;
}

export interface VerifyWebhookResult {
  valid: boolean;
  providerTradeNo?: string;
  orderNo?: string;
  tradeStatus?: string;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult>;
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): Promise<VerifyWebhookResult>;
}

export interface PaymentProviderConfig {
  appId?: string;
  mchId?: string;
  serialNo?: string;
  privateKey?: string;
  apiV3Key?: string;
  alipayPublicKey?: string;
  gateway?: string;
}

export function createPaymentProvider(
  method: PaymentMethod,
  environment: PaymentEnvironment = 'mock',
  config: PaymentProviderConfig = {},
): PaymentProvider {
  if (environment === 'mock') {
    return new MockPaymentProvider(method, environment);
  }

  if (method === 'wechat') {
    return new WechatPaymentProvider(environment, config);
  }
  return new AlipayPaymentProvider(environment, config);
}
