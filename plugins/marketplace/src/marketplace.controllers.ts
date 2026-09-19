/**
 * Marketplace HTTP surface.
 *
 * Relocated from `api/modules/marketplace/marketplace.controllers.ts`. Routes (`/api/shop`,
 * 16 of them) and response shapes are unchanged: every route answers
 * `{ success: true, ...payload }` with no `data` key, and the six POST routes below
 * `createItem` deliberately keep `@HttpCode(HttpStatus.OK)` rather than Nest's 201.
 * The endpoint snapshot and the deployed frontend both depend on that.
 *
 * What changed: the service is async (the classroom port is), so every handler awaits,
 * and the legacy `throwMarketplaceError` wrapper is gone. The kernel's exception filter
 * turns the `ApiError` the service throws into the same status + `{ success: false,
 * message }` body the wrapper used to build - see the economy/gacha controllers, which
 * dropped the identical wrapper.
 *
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation.
 */

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext } from '@thinkclass/kernel';

import { MarketplaceService } from './marketplace.service.js';

/**
 * The student id behind a student actor, or null.
 *
 * The pre-migration controller resolved the caller with `getRequestActor(req)` and
 * gated only when `actor.role === 'student' && actor.id`. `RequestContext.actor` carries
 * `userId` (never `studentId`), so the service resolves the student through
 * `classroom.public.getStudentByUserId` - the same lookup the legacy
 * `getClassIdByUserId(userId, 'student')` performed.
 */
function studentActorId(req: Request): number | null {
  const actor = getRequestContext(req).actor;
  return actor && actor.role === 'student' && actor.userId ? actor.userId : null;
}

@Controller('api/shop')
export class MarketplaceController {
  constructor(@Inject(MarketplaceService) private readonly marketplaceService: MarketplaceService) {}

  @Get('items')
  async listItems(@Req() req: Request, @Query() query: Record<string, any>) {
    const items = await this.marketplaceService.listItems(query?.studentId, studentActorId(req));
    return { success: true, items };
  }

  @Get('all')
  listAllItems(@Query() query: Record<string, any>) {
    return { success: true, items: this.marketplaceService.listAllItems(query) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createItem(@Body() body: Record<string, any>) {
    return { success: true, ...this.marketplaceService.createItem(body) };
  }

  @Put(':id/status')
  updateItemStatus(@Param('id') id: string, @Body() body: Record<string, any>) {
    this.marketplaceService.updateItemStatus(id, body);
    return { success: true };
  }

  @Put(':id')
  updateItem(@Param('id') id: string, @Body() body: Record<string, any>) {
    this.marketplaceService.updateItem(id, body);
    return { success: true };
  }

  @Post('buy')
  @HttpCode(HttpStatus.OK)
  async buyItem(@Body() body: Record<string, any>) {
    return { success: true, ...(await this.marketplaceService.buyItem(body)) };
  }

  @Get('auctions')
  async listAuctions(@Req() req: Request) {
    const auctions = await this.marketplaceService.listAuctions(studentActorId(req));
    return { success: true, auctions };
  }

  @Post('auctions/:id/bid')
  @HttpCode(HttpStatus.OK)
  async bidAuction(@Param('id') id: string, @Body() body: Record<string, any>) {
    return { success: true, ...(await this.marketplaceService.bidAuction(id, body)) };
  }

  @Post('blind_box')
  @HttpCode(HttpStatus.OK)
  async buyBlindBox(@Body() body: Record<string, any>) {
    return { success: true, ...(await this.marketplaceService.buyBlindBox(body)) };
  }

  @Post('auctions')
  @HttpCode(HttpStatus.OK)
  createAuction(@Body() body: Record<string, any>) {
    return { success: true, ...this.marketplaceService.createAuction(body) };
  }

  @Put('auctions/:id')
  updateAuction(@Param('id') id: string, @Body() body: Record<string, any>) {
    this.marketplaceService.updateAuction(id, body);
    return { success: true };
  }

  @Delete('auctions/:id')
  deleteAuction(@Param('id') id: string) {
    this.marketplaceService.deleteAuction(id);
    return { success: true };
  }

  @Get('blind_boxes')
  async listBlindBoxes(@Req() req: Request) {
    const boxes = await this.marketplaceService.listBlindBoxes(studentActorId(req));
    return { success: true, boxes };
  }

  @Post('blind_boxes')
  @HttpCode(HttpStatus.OK)
  createBlindBox(@Body() body: Record<string, any>) {
    return { success: true, ...this.marketplaceService.createBlindBox(body) };
  }

  @Put('blind_boxes/:id')
  updateBlindBox(@Param('id') id: string, @Body() body: Record<string, any>) {
    this.marketplaceService.updateBlindBox(id, body);
    return { success: true };
  }

  @Delete('blind_boxes/:id')
  deleteBlindBox(@Param('id') id: string) {
    this.marketplaceService.deleteBlindBox(id);
    return { success: true };
  }
}
