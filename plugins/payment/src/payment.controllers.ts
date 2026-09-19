/**
 * The three `api/payment` routes, relocated from
 * `api/modules/platform/platform.controllers.ts`.
 *
 * METHOD+PATH unchanged (`POST /api/payment/create`, `GET /api/payment/status/:orderNo`,
 * `POST /api/payment/notify`), so the endpoint surface does not move.
 *
 * Two details are contract rather than style, and both came from the deleted controller:
 *
 *  1. **`create` and `status` pin 200** with `@HttpCode(HttpStatus.OK)`. `notify` does not: it
 *     replies with the literal `success` body the channels check for, through `@Res()`.
 *  2. **`notify` answers `success` for anything it accepts**, including a webhook that verifies
 *     but carries a non-paid status - the channel must not be told to retry a notification this
 *     system deliberately ignores. Failures (bad signature, unknown order, bad method) become the
 *     kernel envelope with the legacy messages, because the legacy `throwPlatformError` let an
 *     `ApiError` through unchanged.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

import { paymentOrderPayload, PaymentService } from './payment.service.js';
import type { PaymentMethod } from './providers/index.js';

/** The caller, as the kernel's request context resolved it. */
function actorIdOf(req: Request): number | null {
  const actor = getRequestContext(req).actor;
  return actor ? actor.userId : null;
}

@Controller('api/payment')
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly paymentService: PaymentService) {}

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createPayment(@Req() req: Request, @Body() body: Record<string, any>) {
    const actorId = actorIdOf(req);
    if (!actorId) throw new ApiError(403, '未登录');

    // Built from the request, exactly as the legacy service did: a deployment behind a proxy that
    // rewrites the host must keep announcing the URL it is reached at, not a configured guess.
    const notifyUrl = `${req.protocol}://${req.get('host')}/api/payment/notify`;
    const order = await this.paymentService.createOrder({ userId: actorId, method: body?.method, notifyUrl });

    return { success: true, message: '订单创建成功', data: paymentOrderPayload(order) };
  }

  @Get('status/:orderNo')
  async getPaymentStatus(@Req() req: Request, @Param('orderNo') orderNo: string) {
    const actorId = actorIdOf(req);
    if (!actorId) throw new ApiError(403, '未登录');

    const order = this.paymentService.getOrderForUser(orderNo, actorId);
    return { success: true, data: paymentOrderPayload(order) };
  }

  @Post('notify')
  async notifyPayment(@Req() req: Request, @Body() body: Record<string, any>, @Res() res: Response) {
    const { orderNo, method, trade_status, providerTradeNo } = body ?? {};
    if (!orderNo || typeof orderNo !== 'string') throw new ApiError(400, 'Missing orderNo');
    if (method !== 'wechat' && method !== 'alipay') throw new ApiError(400, 'Invalid method');

    // Signature verification happens here rather than in the service because it needs the raw
    // headers, and the provider must be the *configured environment's* - a mock deployment
    // verifies the mock signature, which is what makes the notify route testable without channel
    // credentials.
    const provider = this.paymentService.provider(method as PaymentMethod);
    const verified = await provider.verifyWebhookSignature(
      req.headers as Record<string, string | string[] | undefined>,
      body ?? {},
    );
    if (!verified.valid) throw new ApiError(401, 'Invalid signature');

    await this.paymentService.applyWebhook({
      orderNo,
      method: method as PaymentMethod,
      tradeStatus: trade_status,
      providerTradeNo: typeof providerTradeNo === 'string' ? providerTradeNo : (verified.providerTradeNo ?? null),
      signature: req.header('x-payment-signature') ?? null,
      payload: verified.payload,
    });

    return res.status(200).send('success');
  }
}
