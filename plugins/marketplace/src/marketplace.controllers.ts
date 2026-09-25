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
 * Authorization is now the controller's job, and it is the reason this file is not a pure
 * relocation any more. Every route resolves the caller from the kernel's verified request
 * context (`./marketplace.authorization.js`, 401 before anything else) and then either
 * restricts the role - shop/auction administration is teacher/admin, buying is student - or
 * narrows what may be read or written to the actor's own row:
 *
 *   - `GET /api/shop/items` returns the shelf of the *caller's* teacher (a student's own
 *     class), their own items (a teacher), or every active item (admin); it used to answer
 *     the whole table whenever no `?studentId=` was supplied.
 *   - `GET /api/shop/all` forces a teacher's `teacherId` to their own login id, so the
 *     `?teacherId=` filter can no longer name somebody else's shelf.
 *   - `PUT /api/shop/:id` and `/status` check item ownership.
 *   - The three money routes (`buy`, `auctions/:id/bid`, `blind_box`) derive the student from
 *     the actor, and refuse a body that names a different one.
 */

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { assertSameStudent, requireActorRole, studentActorId } from './marketplace.authorization.js';
import { MarketplaceService } from './marketplace.service.js';

/** Item and auction administration: the seller's own surface plus the admin console. */
const STAFF = ['teacher', 'admin', 'superadmin'];

/** The shop and the auction board are read by the class they belong to - not by parents. */
const CLASS_READERS = ['student', 'teacher', 'admin', 'superadmin'];

@Controller('api/shop')
export class MarketplaceController {
  constructor(@Inject(MarketplaceService) private readonly marketplaceService: MarketplaceService) {}

  @Get('items')
  async listItems(@Req() req: Request) {
    const actor = requireActorRole(req, CLASS_READERS);
    return { success: true, items: await this.marketplaceService.listItems(actor) };
  }

  @Get('all')
  listAllItems(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return { success: true, items: this.marketplaceService.listAllItems(actor, query) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createItem(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return { success: true, ...this.marketplaceService.createItem(actor, body) };
  }

  @Put(':id/status')
  updateItemStatus(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    this.marketplaceService.updateItemStatus(actor, id, body);
    return { success: true };
  }

  @Put(':id')
  updateItem(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    this.marketplaceService.updateItem(actor, id, body);
    return { success: true };
  }

  @Post('buy')
  @HttpCode(HttpStatus.OK)
  async buyItem(@Req() req: Request, @Body() body: Record<string, any>) {
    const studentId = studentActorId(req);
    assertSameStudent(studentId, body?.studentId);
    return { success: true, ...(await this.marketplaceService.buyItem(studentId, body)) };
  }

  @Get('auctions')
  async listAuctions(@Req() req: Request) {
    const actor = requireActorRole(req, CLASS_READERS);
    return { success: true, auctions: await this.marketplaceService.listAuctions(actor) };
  }

  @Post('auctions/:id/bid')
  @HttpCode(HttpStatus.OK)
  async bidAuction(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const studentId = studentActorId(req);
    assertSameStudent(studentId, body?.studentId);
    return { success: true, ...(await this.marketplaceService.bidAuction(studentId, id, body)) };
  }

  @Post('blind_box')
  @HttpCode(HttpStatus.OK)
  async buyBlindBox(@Req() req: Request, @Body() body: Record<string, any>) {
    const studentId = studentActorId(req);
    assertSameStudent(studentId, body?.studentId);
    return { success: true, ...(await this.marketplaceService.buyBlindBox(studentId, body)) };
  }

  @Post('auctions')
  @HttpCode(HttpStatus.OK)
  createAuction(@Req() req: Request, @Body() body: Record<string, any>) {
    requireActorRole(req, STAFF);
    return { success: true, ...this.marketplaceService.createAuction(body) };
  }

  @Put('auctions/:id')
  updateAuction(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    requireActorRole(req, STAFF);
    this.marketplaceService.updateAuction(id, body);
    return { success: true };
  }

  @Delete('auctions/:id')
  deleteAuction(@Req() req: Request, @Param('id') id: string) {
    requireActorRole(req, STAFF);
    this.marketplaceService.deleteAuction(id);
    return { success: true };
  }

  @Get('blind_boxes')
  async listBlindBoxes(@Req() req: Request) {
    const actor = requireActorRole(req, CLASS_READERS);
    const boxes = await this.marketplaceService.listBlindBoxes(actor);
    return { success: true, boxes };
  }

  @Post('blind_boxes')
  @HttpCode(HttpStatus.OK)
  createBlindBox(@Req() req: Request, @Body() body: Record<string, any>) {
    requireActorRole(req, STAFF);
    return { success: true, ...this.marketplaceService.createBlindBox(body) };
  }

  @Put('blind_boxes/:id')
  updateBlindBox(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    requireActorRole(req, STAFF);
    this.marketplaceService.updateBlindBox(id, body);
    return { success: true };
  }

  @Delete('blind_boxes/:id')
  deleteBlindBox(@Req() req: Request, @Param('id') id: string) {
    requireActorRole(req, STAFF);
    this.marketplaceService.deleteBlindBox(id);
    return { success: true };
  }
}
