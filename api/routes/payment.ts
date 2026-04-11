import { Router, type Request, type Response } from 'express';

import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { prisma } from '../prismaClient.js';
import { createPaymentProvider } from '../services/paymentProviders/index.js';
import { getRequestActor } from '../utils/requestAuth.js';
import { createPaymentOrder, getOrderForUser, markOrderPaid } from '../services/paymentService.js';

const router = Router();

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

router.post(
  '/create',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getRequestActor(req);
    if (!actor.id) {
      throw new ApiError(403, '未登录');
    }

    const method = req.body?.method;
    if (method !== 'wechat' && method !== 'alipay') {
      throw new ApiError(400, 'Invalid method');
    }

    const notifyUrl = `${req.protocol}://${req.get('host')}/api/payment/notify`;
    const order = await createPaymentOrder({
      userId: actor.id,
      method,
      notifyUrl,
    });
    const runtime = readOrderRuntime(order.channel_payload);

    res.json({
      success: true,
      message: '订单创建成功',
      data: {
        orderNo: order.order_no,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        qrCodeUrl: order.qr_code_url,
        paymentUrl: order.payment_url,
        expiresAt: order.expires_at,
        environment: runtime.environment,
        providerMode: runtime.providerMode,
      },
    });
  }),
);

router.get(
  '/status/:orderNo',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getRequestActor(req);
    if (!actor.id) {
      throw new ApiError(403, '未登录');
    }

    const orderNo = req.params.orderNo;
    const order = await getOrderForUser(orderNo, actor.id);
    const runtime = readOrderRuntime(order.channel_payload);

    res.json({
      success: true,
      data: {
        orderNo: order.order_no,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        qrCodeUrl: order.qr_code_url,
        paymentUrl: order.payment_url,
        expiresAt: order.expires_at,
        environment: runtime.environment,
        providerMode: runtime.providerMode,
      },
    });
  }),
);

router.post(
  '/notify',
  asyncHandler(async (req: Request, res: Response) => {
    const { orderNo, method, trade_status, providerTradeNo } = req.body ?? {};
    if (!orderNo || typeof orderNo !== 'string') throw new ApiError(400, 'Missing orderNo');
    if (method !== 'wechat' && method !== 'alipay') throw new ApiError(400, 'Invalid method');

    const signatureHeader = req.header('x-payment-signature') ?? null;
    const environment = await prisma.settings.findUnique({ where: { key: 'payment_environment' } });
    const provider = createPaymentProvider(method, (environment?.value as 'mock' | 'sandbox' | 'production' | undefined) ?? 'mock');
    const verified = await provider.verifyWebhookSignature(req.headers as any, req.body ?? {});
    if (!verified.valid) {
      throw new ApiError(401, 'Invalid signature');
    }

    const isPaid = trade_status === 'SUCCESS' || trade_status === 'TRADE_SUCCESS';
    if (!isPaid) {
      res.status(200).send('success');
      return;
    }

    await markOrderPaid({
      orderNo,
      provider: method,
      providerTradeNo: typeof providerTradeNo === 'string' ? providerTradeNo : verified.providerTradeNo ?? null,
      payload: verified.payload,
      signature: signatureHeader,
    });

    res.status(200).send('success');
  }),
);

export default router;
