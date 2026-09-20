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

/**
 * Build the provider for a method in an environment.
 *
 * The order of the two decisions is the contract, and it used to be wrong: `mock` is an explicit
 * environment, and it is the only one that may return `MockPaymentProvider`. Every other
 * environment must reach a real channel provider - the previous version fell through to
 * `AlipayPaymentProvider`, which extended the mock, so `production` + `alipay` issued
 * `mock-pay.local` URLs and accepted the mock webhook signature in production.
 */
export function createPaymentProvider(
  method: PaymentMethod,
  environment: PaymentEnvironment = 'production',
  config: PaymentProviderConfig = {},
): PaymentProvider {
  if (environment === 'mock') {
    return new MockPaymentProvider(method, environment);
  }

  switch (method) {
    case 'wechat':
      return new WechatPaymentProvider(environment, config);
    case 'alipay':
      return new AlipayPaymentProvider(environment, config);
    default:
      throw new Error(`Unsupported payment method: ${String(method)}`);
  }
}
