import { AlipayPaymentProvider } from './alipayProvider.js';
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
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult>;
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): Promise<VerifyWebhookResult>;
}

export function createPaymentProvider(
  method: PaymentMethod,
  environment: PaymentEnvironment = 'mock',
): PaymentProvider {
  if (method === 'wechat') {
    return new WechatPaymentProvider(environment);
  }
  return new AlipayPaymentProvider(environment);
}
