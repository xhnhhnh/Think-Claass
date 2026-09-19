import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { throwPlatformError } from './platform.errors.js';
import { PlatformService } from './platform.service.js';

/**
 * Payment infrastructure HTTP surface.
 *
 * `ParentBuffController` left this file in P4.3b.5d, when the parent-blessing action became
 * `plugins/parent-buff`; what remains is the payment half.
 *
 * Payment is deliberately still here and NOT a plugin. `api/services/paymentService.ts`
 * drives `payment_orders` / `payment_transactions` through Prisma and activates users via
 * `api/services/activationService.ts` - platform infrastructure that a feature plugin
 * should not swallow. Whether it ends up kernel-side or as a non-feature plugin (tier
 * `infrastructure`) is an open decision, tracked in HANDOFF §8.9.
 */
@Controller('api/payment')
export class PaymentController {
  constructor(@Inject(PlatformService) private readonly platformService: PlatformService) {}

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createPayment(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...await this.platformService.createPayment(req, body) };
    } catch (error) {
      throwPlatformError(error);
    }
  }

  @Get('status/:orderNo')
  async getPaymentStatus(@Req() req: Request, @Param('orderNo') orderNo: string) {
    try {
      return { success: true, ...await this.platformService.getPaymentStatus(req, orderNo) };
    } catch (error) {
      throwPlatformError(error);
    }
  }

  @Post('notify')
  async notifyPayment(@Req() req: Request, @Body() body: Record<string, any>, @Res() res: Response) {
    try {
      await this.platformService.notifyPayment(req, body);
      return res.status(200).send('success');
    } catch (error) {
      throwPlatformError(error);
    }
  }
}
