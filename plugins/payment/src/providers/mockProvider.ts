import { randomUUID } from 'crypto';

import type { CreatePaymentOrderInput, CreatePaymentOrderResult, PaymentProvider, VerifyWebhookResult } from './index.js';

export class MockPaymentProvider implements PaymentProvider {
  constructor(
    private readonly method: 'wechat' | 'alipay',
    private readonly environment: 'mock' | 'sandbox' | 'production' = 'mock',
  ) {}

  async createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
    const channelOrderId = `${this.method.toUpperCase()}-${randomUUID()}`;
    const mockUrl = `https://mock-pay.local/${this.method}/${input.orderNo}`;

    return {
      provider: this.method,
      channelOrderId,
      qrCodeUrl: mockUrl,
      paymentUrl: mockUrl,
      payload: {
        mode: 'mock',
        environment: this.environment,
        providerMode: 'mock',
        method: this.method,
        amount: input.amount,
        orderNo: input.orderNo,
      },
    };
  }

  async verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
  ): Promise<VerifyWebhookResult> {
    const signatureHeader = headers['x-payment-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    return {
      valid: signature === 'mock-valid-signature',
      providerTradeNo: typeof body.providerTradeNo === 'string' ? body.providerTradeNo : undefined,
      payload: body,
    };
  }
}
