import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { throwPlatformError } from './platform.errors.js';
import { PlatformService } from './platform.service.js';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Internal Server Error');

@Controller('api/parent-buff')
export class ParentBuffController {
  constructor(@Inject(PlatformService) private readonly platformService: PlatformService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  createParentBuff(@Body() body: Record<string, any>) {
    try {
      this.platformService.createParentBuff(body);
      return { success: true };
    } catch (error) {
      throwPlatformError(error, errorMessage);
    }
  }
}

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
