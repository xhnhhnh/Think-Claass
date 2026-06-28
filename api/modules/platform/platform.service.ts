import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import db from '../../db.js';
import { prisma } from '../../prismaClient.js';
import { createPaymentOrder, getOrderForUser, markOrderPaid } from '../../services/paymentService.js';
import { createPaymentProvider } from '../../services/paymentProviders/index.js';
import { ApiError } from '../../utils/apiError.js';
import { getRequestActor } from '../../utils/requestAuth.js';

function readOrderRuntime(channelPayload: string | null) {
  try {
    const payload = channelPayload ? JSON.parse(channelPayload) as Record<string, unknown> : {};
    return {
      environment: typeof payload.environment === 'string' ? payload.environment : 'mock',
      providerMode: typeof payload.providerMode === 'string' ? payload.providerMode : 'mock',
    };
  } catch {
    return {
      environment: 'mock',
      providerMode: 'mock',
    };
  }
}

function paymentOrderPayload(order: any) {
  const runtime = readOrderRuntime(order.channel_payload);
  return {
    orderNo: order.order_no,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    qrCodeUrl: order.qr_code_url,
    paymentUrl: order.payment_url,
    expiresAt: order.expires_at,
    environment: runtime.environment,
    providerMode: runtime.providerMode,
  };
}

@Injectable()
export class PlatformService {
  createParentBuff(input: Record<string, any>) {
    const { studentId } = input ?? {};
    if (!studentId) {
      throw new ApiError(400, 'Student ID required');
    }

    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT id FROM parent_activity WHERE student_id = ? AND date(created_at) = ?').get(studentId, today);
    if (existing) {
      throw new ApiError(400, '今日已经施放过祝福了');
    }

    db.prepare('INSERT INTO parent_activity (student_id, activity_type, points_awarded) VALUES (?, ?, ?)')
      .run(studentId, 'PARENT_BUFF', 0);
  }

  async createPayment(req: Request, input: Record<string, any>) {
    const actor = getRequestActor(req);
    if (!actor.id) throw new ApiError(403, '未登录');

    const method = input?.method;
    if (method !== 'wechat' && method !== 'alipay') throw new ApiError(400, 'Invalid method');

    const notifyUrl = `${req.protocol}://${req.get('host')}/api/payment/notify`;
    const order = await createPaymentOrder({
      userId: actor.id,
      method,
      notifyUrl,
    });

    return {
      message: '订单创建成功',
      data: paymentOrderPayload(order),
    };
  }

  async getPaymentStatus(req: Request, orderNo: string) {
    const actor = getRequestActor(req);
    if (!actor.id) throw new ApiError(403, '未登录');

    const order = await getOrderForUser(orderNo, actor.id);
    return { data: paymentOrderPayload(order) };
  }

  async notifyPayment(req: Request, input: Record<string, any>) {
    const { orderNo, method, trade_status, providerTradeNo } = input ?? {};
    if (!orderNo || typeof orderNo !== 'string') throw new ApiError(400, 'Missing orderNo');
    if (method !== 'wechat' && method !== 'alipay') throw new ApiError(400, 'Invalid method');

    const signatureHeader = req.header('x-payment-signature') ?? null;
    const environment = await prisma.settings.findUnique({ where: { key: 'payment_environment' } });
    const provider = createPaymentProvider(method, (environment?.value as 'mock' | 'sandbox' | 'production' | undefined) ?? 'mock');
    const verified = await provider.verifyWebhookSignature(req.headers as any, input ?? {});
    if (!verified.valid) throw new ApiError(401, 'Invalid signature');

    const isPaid = trade_status === 'SUCCESS' || trade_status === 'TRADE_SUCCESS';
    if (!isPaid) return;

    await markOrderPaid({
      orderNo,
      provider: method,
      providerTradeNo: typeof providerTradeNo === 'string' ? providerTradeNo : verified.providerTradeNo ?? null,
      payload: verified.payload,
      signature: signatureHeader,
    });
  }
}
