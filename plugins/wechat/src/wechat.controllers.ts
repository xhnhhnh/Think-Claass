/**
 * The `api/wechat` surface.
 *
 * Four routes, and the split between them is the whole design:
 *
 *   POST /api/wechat/login    public - a wx.login code comes in; a session or a ticket comes out
 *   POST /api/wechat/bind     public - a ticket plus the account password completes the binding
 *   GET  /api/wechat/me       actor  - restore a session the client still holds
 *   POST /api/wechat/unbind   actor  - detach the caller's own WeChat
 *
 * The two public routes are the only anonymous ones a mini program needs, and they are anonymous
 * for the same reason `POST /api/auth/login` is: there is no session yet. `tests/e2e/publicRoutes.json`
 * records both with their reasons, so the authorization audit can disagree with this file.
 *
 * Error translation mirrors `plugins/identity`: the service throws the kernel's `ApiError`, the
 * composition's global filter renders it into the shared `{ success: false, message }` envelope, and
 * the only thing left here is the fallback for an unexpected error.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

import { ApiError } from '@thinkclass/kernel';

import { requireActor } from './wechat.authorization.js';
import { WechatService, type WechatRequestMeta } from './wechat.service.js';

function throwWechatError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (error instanceof ApiError) throw error;

  throw new ApiError(500, 'Internal Server Error');
}

function requestMeta(req: Request): WechatRequestMeta {
  return { userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null };
}

@Controller('api/wechat')
export class WechatController {
  constructor(@Inject(WechatService) private readonly wechatService: WechatService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: Record<string, any>, @Req() req: Request) {
    try {
      return await this.wechatService.login(body ?? {}, requestMeta(req));
    } catch (error) {
      throwWechatError(error);
    }
  }

  @Post('bind')
  @HttpCode(HttpStatus.OK)
  async bind(@Body() body: Record<string, any>, @Req() req: Request) {
    try {
      return await this.wechatService.bind(body ?? {}, requestMeta(req));
    } catch (error) {
      throwWechatError(error);
    }
  }

  @Get('me')
  async me(@Req() req: Request) {
    try {
      return await this.wechatService.me(requireActor(req).id);
    } catch (error) {
      throwWechatError(error);
    }
  }

  @Post('unbind')
  @HttpCode(HttpStatus.OK)
  async unbind(@Req() req: Request) {
    try {
      return await this.wechatService.unbind(requireActor(req).id);
    } catch (error) {
      throwWechatError(error);
    }
  }
}
