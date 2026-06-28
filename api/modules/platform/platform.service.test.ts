import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';

const dbMocks = vi.hoisted(() => ({
  get: vi.fn(),
  prepare: vi.fn(),
  run: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  settingsFindUnique: vi.fn(),
}));

const paymentMocks = vi.hoisted(() => ({
  createPaymentOrder: vi.fn(),
  getOrderForUser: vi.fn(),
  markOrderPaid: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  createPaymentProvider: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
  },
}));

vi.mock('../../prismaClient.js', () => ({
  prisma: {
    settings: {
      findUnique: prismaMocks.settingsFindUnique,
    },
  },
}));

vi.mock('../../services/paymentService.js', () => ({
  createPaymentOrder: paymentMocks.createPaymentOrder,
  getOrderForUser: paymentMocks.getOrderForUser,
  markOrderPaid: paymentMocks.markOrderPaid,
}));

vi.mock('../../services/paymentProviders/index.js', () => ({
  createPaymentProvider: providerMocks.createPaymentProvider,
}));

import { PlatformService } from './platform.service';

function mockPreparedStatement() {
  dbMocks.prepare.mockImplementation((sql: string) => ({
    get: (...args: unknown[]) => dbMocks.get(sql, ...args),
    run: (...args: unknown[]) => dbMocks.run(sql, ...args),
  }));
}

function mockReq(role = 'student', id: number | null = 1): Request {
  return {
    protocol: 'https',
    get(name: string) {
      if (name === 'host') return 'example.test';
      return undefined;
    },
    header(name: string) {
      if (name === 'x-user-role') return role;
      if (name === 'x-user-id') return id === null ? undefined : String(id);
      if (name === 'x-payment-signature') return 'sig';
      return undefined;
    },
    headers: { 'x-payment-signature': 'sig' },
  } as unknown as Request;
}

function expectApiError(fn: () => unknown, statusCode: number, message: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
    expect((error as ApiError).message).toBe(message);
  }
}

describe('PlatformService', () => {
  let service: PlatformService;

  beforeEach(() => {
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    Object.values(prismaMocks).forEach((mock) => mock.mockReset());
    Object.values(paymentMocks).forEach((mock) => mock.mockReset());
    Object.values(providerMocks).forEach((mock) => mock.mockReset());
    mockPreparedStatement();
    service = new PlatformService();
  });

  it('keeps parent buff required student, duplicate guard, and success side effect', () => {
    expectApiError(() => service.createParentBuff({}), 400, 'Student ID required');

    dbMocks.get.mockReturnValueOnce({ id: 1 });
    expectApiError(() => service.createParentBuff({ studentId: 2 }), 400, '今日已经施放过祝福了');

    dbMocks.get.mockReturnValueOnce(undefined);
    expect(service.createParentBuff({ studentId: 2 })).toBeUndefined();
    expect(dbMocks.run).toHaveBeenCalledWith(
      'INSERT INTO parent_activity (student_id, activity_type, points_awarded) VALUES (?, ?, ?)',
      2,
      'PARENT_BUFF',
      0,
    );
  });

  it('keeps payment create/status response payloads and auth/method guards', async () => {
    await expect(service.createPayment(mockReq('student', null), { method: 'wechat' })).rejects.toMatchObject({
      statusCode: 403,
      message: '未登录',
    });
    await expect(service.createPayment(mockReq(), { method: 'card' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid method',
    });

    paymentMocks.createPaymentOrder.mockResolvedValueOnce({
      order_no: 'ORD-1',
      status: 'AWAITING_PAYMENT',
      amount: 99,
      currency: 'CNY',
      qr_code_url: 'qr',
      payment_url: 'pay',
      expires_at: new Date('2026-01-01T00:00:00Z'),
      channel_payload: '{"environment":"mock","providerMode":"mock"}',
    });

    await expect(service.createPayment(mockReq(), { method: 'wechat' })).resolves.toMatchObject({
      message: '订单创建成功',
      data: {
        orderNo: 'ORD-1',
        status: 'AWAITING_PAYMENT',
        amount: 99,
        currency: 'CNY',
        qrCodeUrl: 'qr',
        paymentUrl: 'pay',
        environment: 'mock',
        providerMode: 'mock',
      },
    });
    expect(paymentMocks.createPaymentOrder).toHaveBeenCalledWith({
      userId: 1,
      method: 'wechat',
      notifyUrl: 'https://example.test/api/payment/notify',
    });

    paymentMocks.getOrderForUser.mockResolvedValueOnce({
      order_no: 'ORD-2',
      status: 'PAID',
      amount: 99,
      currency: 'CNY',
      qr_code_url: null,
      payment_url: null,
      expires_at: null,
      channel_payload: null,
    });
    await expect(service.getPaymentStatus(mockReq(), 'ORD-2')).resolves.toMatchObject({
      data: { orderNo: 'ORD-2', environment: 'mock', providerMode: 'mock' },
    });
  });

  it('keeps payment notify validation, signature guard, non-paid short circuit, and paid write', async () => {
    await expect(service.notifyPayment(mockReq(), { method: 'wechat' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Missing orderNo',
    });
    await expect(service.notifyPayment(mockReq(), { orderNo: 'ORD-1', method: 'card' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid method',
    });

    prismaMocks.settingsFindUnique.mockResolvedValue({ value: 'mock' });
    providerMocks.createPaymentProvider.mockReturnValue({ verifyWebhookSignature: providerMocks.verifyWebhookSignature });
    providerMocks.verifyWebhookSignature.mockResolvedValueOnce({ valid: false, payload: {} });
    await expect(service.notifyPayment(mockReq(), { orderNo: 'ORD-1', method: 'wechat' })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid signature',
    });

    providerMocks.verifyWebhookSignature.mockResolvedValueOnce({ valid: true, payload: { ok: true } });
    await expect(service.notifyPayment(mockReq(), { orderNo: 'ORD-1', method: 'wechat', trade_status: 'WAIT_BUYER_PAY' })).resolves.toBeUndefined();
    expect(paymentMocks.markOrderPaid).not.toHaveBeenCalled();

    providerMocks.verifyWebhookSignature.mockResolvedValueOnce({ valid: true, providerTradeNo: 'PTN', payload: { ok: true } });
    await expect(service.notifyPayment(mockReq(), { orderNo: 'ORD-1', method: 'wechat', trade_status: 'SUCCESS' })).resolves.toBeUndefined();
    expect(paymentMocks.markOrderPaid).toHaveBeenCalledWith({
      orderNo: 'ORD-1',
      provider: 'wechat',
      providerTradeNo: 'PTN',
      payload: { ok: true },
      signature: 'sig',
    });
  });
});
