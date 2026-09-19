/**
 * The four `api/auth` routes, relocated from `api/modules/auth/auth.controller.ts`.
 *
 * METHOD+PATH are unchanged (`POST /api/auth/login`, `PUT /api/auth/profile`,
 * `POST /api/auth/register`, `POST /api/auth/activate`) - they are what the deployed frontend
 * calls, so `provides.routes` declares the real paths and the manifest validator's
 * "not namespaced under /api/identity" warning is expected. `plugins/learning` documents the same
 * situation for its five legacy prefixes.
 *
 * Status codes: every handler is a POST/PUT and keeps Nest's defaults *except* login, register and
 * activate, which the legacy controller pinned to 200 with `@HttpCode(HttpStatus.OK)`. Nest would
 * otherwise answer 201 for a POST, which is a client-visible change.
 *
 * Session issuance: the legacy controller reached for `getActiveKernel().sessions.issue(...)` - a
 * service locator, listed as debt item 1 in HANDOFF section 10. Inside a plugin the session
 * service arrives through the context, so this route is what finally removes that consumer.
 */

import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext } from '@thinkclass/kernel';

import { throwIdentityError } from './identity.errors.js';
import { IdentityService } from './identity.service.js';
import type { RequestActor } from './identity.types.js';

/** The caller, exactly as `api/utils/requestAuth.ts` resolved it. */
function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
}

@Controller('api/auth')
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  /**
   * Login, now also issuing a session token.
   *
   * `req.session` is not used: the plugin mints its own through `ctx.sessions`, which is the same
   * store `createRequestContextMiddleware` verifies against, so a token issued here is accepted on
   * the next request.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: Record<string, any>, @Req() req: Request) {
    try {
      const result = await this.identityService.login(body);

      const user = (result as { user?: { id?: number; role?: string } }).user;
      if (!user?.id || !user.role) return result;

      const session = this.identityService.issueSession({
        userId: user.id,
        role: user.role,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
      });

      return { ...result, token: session.token, expiresAt: session.expiresAt };
    } catch (error) {
      throwIdentityError(error);
    }
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return await this.identityService.updateProfile(actorOf(req), body);
    } catch (error) {
      throwIdentityError(error);
    }
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() body: Record<string, any>) {
    try {
      return await this.identityService.register(body);
    } catch (error) {
      throwIdentityError(error);
    }
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Body() body: Record<string, any>) {
    try {
      return await this.identityService.activate(body);
    } catch (error) {
      throwIdentityError(error);
    }
  }
}
