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
 */

import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { PortalService } from './portal.service.js';
import type { LegacyResult } from './portal.types.js';

function returnLegacy(result: LegacyResult) {
  if (result.status >= 400) throw new HttpException(result.body, result.status);
  return result.body;
}

@Controller('api/website')
export class WebsiteController {
  constructor(@Inject(PortalService) private readonly portalService: PortalService) {}

  @Get('home')
  getHome() {
    return { success: true, data: this.portalService.getHome() };
  }

  @Put('home')
  @HttpCode(HttpStatus.OK)
  updateHome(@Body() body: unknown) {
    return returnLegacy(this.portalService.updateHome(body));
  }

  @Get('articles')
  listArticles(@Query() query: Record<string, unknown>) {
    return { success: true, ...this.portalService.listArticles(query as never) };
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return returnLegacy(this.portalService.getArticle(id));
  }

  @Post('articles')
  @HttpCode(HttpStatus.OK)
  createArticle(@Body() body: Record<string, unknown>) {
    return returnLegacy(this.portalService.createArticle(body));
  }

  @Put('articles/:id')
  @HttpCode(HttpStatus.OK)
  updateArticle(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return returnLegacy(this.portalService.updateArticle(id, body));
  }

  @Delete('articles/:id')
  @HttpCode(HttpStatus.OK)
  deleteArticle(@Param('id') id: string) {
    return returnLegacy(this.portalService.deleteArticle(id));
  }

  @Post('contact')
  @HttpCode(HttpStatus.OK)
  createContact(@Body() body: Record<string, unknown>) {
    return returnLegacy(this.portalService.createContact(body));
  }
}
