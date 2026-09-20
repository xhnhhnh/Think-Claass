/**
 * Payment provider factory.
 *
 * Relocated from `api/services/paymentProviders/paymentProviders.test.ts` when the provider layer
 * moved into `plugins/payment` (P4.3b.8). The import path is the only thing that changed: the
 * assertion - that `environment: 'mock'` never constructs a real channel provider, so a mock
 * deployment needs no WeChat/Alipay credentials - is the reason this file exists at all.
 */

import { describe, expect, it } from 'vitest';

import { createPaymentProvider } from '../../plugins/payment/src/providers/index.js';

describe('createPaymentProvider', () => {
  it('keeps mock payments on the mock provider instead of requiring real channel credentials', async () => {
    const provider = createPaymentProvider('wechat', 'mock');

    const order = await provider.createOrder({
      orderNo: 'ORD-MOCK-1',
      amount: 99,
      description: 'Think-Class platform activation',
      method: 'wechat',
      notifyUrl: 'https://example.test/api/payment/notify',
    });

    expect(order.provider).toBe('wechat');
    expect(order.qrCodeUrl).toContain('/wechat/ORD-MOCK-1');
    expect(order.payload).toMatchObject({
      environment: 'mock',
      providerMode: 'mock',
      method: 'wechat',
      orderNo: 'ORD-MOCK-1',
    });
  });

  it('routes a non-mock environment to the real channel provider, which demands credentials', async () => {
    // The counterpart assertion: `environment: 'mock'` must not be the only thing this factory can
    // do. A production WeChat provider without credentials fails at `createOrder` - it does not
    // quietly hand back a `mock-pay.local` URL, which is the failure mode that would let a
    // misconfigured production deployment "sell" subscriptions nobody can pay for.
    const provider = createPaymentProvider('wechat', 'production');

    await expect(
      provider.createOrder({
        orderNo: 'ORD-PROD-1',
        amount: 99,
        description: 'Think-Class platform activation',
        method: 'wechat',
        notifyUrl: 'https://example.test/api/payment/notify',
      }),
    ).rejects.toThrow(/微信支付未配置/);
  });

  it('demands Alipay credentials instead of falling back to the mock, in every non-mock environment', async () => {
    // PAY-1. `AlipayPaymentProvider` used to be `extends MockPaymentProvider` with no body, so this
    // call returned `https://mock-pay.local/alipay/ORD-PROD-2`. Combined with the public notify
    // route and the mock signature, that was a free-activation chain.
    for (const environment of ['production', 'sandbox'] as const) {
      const provider = createPaymentProvider('alipay', environment);

      await expect(
        provider.createOrder({
          orderNo: 'ORD-PROD-2',
          amount: 99,
          description: 'Think-Class platform activation',
          method: 'alipay',
          notifyUrl: 'https://example.test/api/payment/notify',
        }),
      ).rejects.toThrow(/支付宝未配置/);
    }
  });

  it('rejects the mock webhook signature once Alipay credentials are configured', async () => {
    // The other half of the chain: with a key configured, verification is a real RSA2 check, so the
    // literal `mock-valid-signature` header - or any unsigned body - cannot settle an order.
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const provider = createPaymentProvider('alipay', 'production', {
      appId: '2021000000000000',
      privateKey,
      alipayPublicKey: publicKey,
      gateway: 'https://openapi.alipay.com/gateway.do',
    });

    const unsigned = await provider.verifyWebhookSignature(
      { 'x-payment-signature': 'mock-valid-signature' },
      { orderNo: 'ORD-PROD-3', method: 'alipay', trade_status: 'TRADE_SUCCESS' },
    );
    expect(unsigned.valid).toBe(false);

    const forged = await provider.verifyWebhookSignature(
      { 'x-payment-signature': 'mock-valid-signature' },
      {
        orderNo: 'ORD-PROD-3',
        trade_status: 'TRADE_SUCCESS',
        sign_type: 'RSA2',
        sign: 'mock-valid-signature',
      },
    );
    expect(forged.valid).toBe(false);
  });
});
