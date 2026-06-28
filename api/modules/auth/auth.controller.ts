import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { throwAuthError } from './auth.errors.js';
import { AuthService } from './auth.service.js';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: Record<string, any>) {
    try {
      return await this.authService.login(body);
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
