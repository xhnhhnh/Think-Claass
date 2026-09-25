/**
 * Portal HTTP surface.
 *
 * Relocated from `api/modules/portal/portal.controllers.ts`; the eight `api/website`
 * routes and their envelope shapes are unchanged.
 *
 * Note the two response styles, both preserved:
 *   - `getHome` / `listArticles` wrap in `{ success: true, data }` / `{ success, ... }`;
 *   - the rest return the service's legacy `{ status, body }` verbatim, with a >= 400
 *     status raised as an `HttpException` carrying that body.
 *
 * `throwPortalError` is gone: a plugin throws the kernel's `ApiError` and the
 * composition's global filter renders it identically.
 *
 * Authorization is split along the product line:
 *
 *   - the four public routes (`GET home`, `GET articles`, `GET articles/:id`, `POST contact`) stay
 *     anonymous on purpose - the marketing site and the contact form are reached before login;
 *   - the four editor routes (`PUT home`, `POST|PUT|DELETE articles*`) are admin/superadmin. They
 *     were anonymous, which let an unnamed visitor rewrite the site's homepage, publish articles or
 *     delete every one of them; the admin console is their only caller.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { requireActorRole } from './portal.authorization.js';
import { PortalService } from './portal.service.js';
import type { LegacyResult } from './portal.types.js';

function returnLegacy(result: LegacyResult) {
  if (result.status >= 400) throw new HttpException(result.body, result.status);
  return result.body;
}

/** The admin console is the only caller of the editor routes. */
const PORTAL_ADMINS = ['admin', 'superadmin'];

@Controller('api/website')
export class WebsiteController {
  constructor(@Inject(PortalService) private readonly portalService: PortalService) {}

  /** Public: the marketing homepage, read before login. */
  @Get('home')
  getHome() {
    return { success: true, data: this.portalService.getHome() };
  }

  @Put('home')
  @HttpCode(HttpStatus.OK)
  updateHome(@Req() req: Request, @Body() body: unknown) {
    requireActorRole(req, PORTAL_ADMINS);
    return returnLegacy(this.portalService.updateHome(body));
  }

  /** Public: the article list, read before login. */
  @Get('articles')
  listArticles(@Query() query: Record<string, unknown>) {
    return { success: true, ...this.portalService.listArticles(query as never) };
  }

  /** Public: the article body, read before login. */
  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return returnLegacy(this.portalService.getArticle(id));
  }

  @Post('articles')
  @HttpCode(HttpStatus.OK)
  createArticle(@Req() req: Request, @Body() body: Record<string, unknown>) {
    requireActorRole(req, PORTAL_ADMINS);
    return returnLegacy(this.portalService.createArticle(body));
  }

  @Put('articles/:id')
  @HttpCode(HttpStatus.OK)
  updateArticle(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    requireActorRole(req, PORTAL_ADMINS);
    return returnLegacy(this.portalService.updateArticle(id, body));
  }

  @Delete('articles/:id')
  @HttpCode(HttpStatus.OK)
  deleteArticle(@Req() req: Request, @Param('id') id: string) {
    requireActorRole(req, PORTAL_ADMINS);
    return returnLegacy(this.portalService.deleteArticle(id));
  }

  /** Public: the contact form, submitted before login. */
  @Post('contact')
  @HttpCode(HttpStatus.OK)
  createContact(@Body() body: Record<string, unknown>) {
    return returnLegacy(this.portalService.createContact(body));
  }
}
