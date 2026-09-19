import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getActiveKernel } from '@thinkclass/kernel';

import { throwAuthError } from './auth.errors.js';
import { AuthService } from './auth.service.js';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  /**
   * Login, now also issuing a session token.
   *
   * The response keeps its existing shape (`user`, `classFeatures`) so the current
   * frontend keeps working, and gains `token` / `expiresAt`. The client sends the
   * token as a bearer credential; the `x-user-role` / `x-user-id` headers it used
   * to assert are honoured only while the migration bridge is on.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: Record<string, any>, @Req() req: Request) {
    try {
      const result = await this.authService.login(body);
      const kernel = getActiveKernel();
      if (!kernel) return result;

      const user = (result as { user?: { id?: number; role?: string } }).user;
      if (!user?.id || !user.role) return result;

      const session = kernel.sessions.issue({
        userId: user.id,
        role: user.role as never,
        ttlMs: kernel.config.sessionTtlMs,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
      });

      return { ...result, token: session.token, expiresAt: session.expiresAt };
    } catch (error) {
      throwAuthError(error);
    }
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return await this.authService.updateProfile(req, body);
    } catch (error) {
      throwAuthError(error);
    }
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() body: Record<string, any>) {
    try {
      return await this.authService.register(body);
    } catch (error) {
      throwAuthError(error);
    }
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Body() body: Record<string, any>) {
    try {
      return await this.authService.activate(body);
    } catch (error) {
      throwAuthError(error);
    }
  }
}
