/**
 * Economy HTTP surface.
 *
 * Relocated from `api/modules/economy/economy.controllers.ts`. Routes and response
 * shapes are unchanged: the endpoint snapshot and the deployed frontend both depend
 * on them.
 *
 * Two envelope styles coexist and both are deliberate:
 *
 *   - the eight `/bank/*`, `/stocks/*`, `/portfolio/*` aliases answer
 *     `{ success, ...payload }` with NO `data` key, and discard the service result;
 *   - the newer `/students/*`, `/classes/*`, `/teacher/*` routes answer through
 *     `ok()`, i.e. `{ success, data, ...legacyPayload }`, duplicating the payload at
 *     the top level for older clients.
 *
 * Collapsing either into the other is a breaking API change, not a cleanup.
 *
 * Authorization was the "systematic authorization" work HANDOFF §10 deferred, and it is
 * now here (`./economy.authorization.js`: 401 before every validation message, 403 for a
 * known caller without the role). Every route resolves the caller from the kernel's verified
 * request context, and the service narrows the answer to what that caller owns:
 *
 *   - balance / portfolio / overview reads: student (own row), parent (linked child),
 *     teacher (own class), admin;
 *   - the asset-write family (deposit, withdraw, buy, sell - every alias): student, own row
 *     only. A teacher or admin no longer moves a student's points through these routes at all;
 *   - class stock boards: the class's teacher and its students;
 *   - interest settlement: admin/superadmin (the cron path is a direct call, not this route);
 *   - teacher stock CRUD: the owning teacher, or admin.
 *
 * The identity of the subject therefore comes from the actor plus the roster, never from the
 * path alone - which is what made "anonymous can pass any studentId" possible before.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { requireActorRole } from './economy.authorization.js';
import { EconomyService } from './economy.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/** A student's assets: their own row, their linked parent, or a teacher of their class. */
const ASSET_READERS = ['student', 'parent', 'teacher', 'admin', 'superadmin'];

/** A class's stock board is read by its own teacher and its students. */
const CLASS_READERS = ['student', 'teacher', 'admin', 'superadmin'];

/** Stock administration and the interest settlement button. */
const STAFF = ['teacher', 'admin', 'superadmin'];

@Controller('api/economy')
export class EconomyController {
  constructor(@Inject(EconomyService) private readonly economyService: EconomyService) {}

  @Post('bank/trigger-interest')
  async legacyTriggerInterest(@Req() req: Request) {
    requireActorRole(req, ['admin', 'superadmin']);
    this.economyService.triggerInterest();
    return { success: true };
  }

  @Get('bank/:studentId')
  async legacyBank(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ASSET_READERS);
    return { success: true, account: await this.economyService.getBankAccount(actor, studentId) };
  }

  @Post('bank/deposit/:studentId')
  async legacyDeposit(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    await this.economyService.deposit(actor, studentId, body);
    return { success: true };
  }

  @Post('bank/withdraw/:studentId')
  async legacyWithdraw(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    await this.economyService.withdraw(actor, studentId, body);
    return { success: true };
  }

  @Get('stocks/:classId')
  async legacyStocks(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    return { success: true, stocks: await this.economyService.listStocks(actor, classId) };
  }

  @Get('portfolio/:studentId')
  async legacyPortfolio(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ASSET_READERS);
    return { success: true, portfolio: await this.economyService.listPortfolio(actor, studentId) };
  }

  @Post('stocks/buy/:studentId')
  async legacyBuy(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    await this.economyService.buyStock(actor, studentId, body as never);
    return { success: true };
  }

  @Post('stocks/sell/:studentId')
  async legacySell(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    await this.economyService.sellStock(actor, studentId, body as never);
    return { success: true };
  }

  @Get('students/:studentId/overview')
  async overview(@Req() req: Request, @Param('studentId') studentId: string, @Query('classId') classId?: string) {
    const actor = requireActorRole(req, ASSET_READERS);
    return ok(await this.economyService.getStudentOverview(actor, studentId, classId));
  }

  @Get('students/:studentId/bank')
  async bank(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ASSET_READERS);
    const account = await this.economyService.getBankAccount(actor, studentId);
    return ok({ account }, { account });
  }

  @Post('students/:studentId/bank/deposits')
  async deposit(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    return ok(await this.economyService.deposit(actor, studentId, body));
  }

  @Post('students/:studentId/bank/withdrawals')
  async withdraw(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    return ok(await this.economyService.withdraw(actor, studentId, body));
  }

  @Get('classes/:classId/stocks')
  async stocks(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    const stocks = await this.economyService.listStocks(actor, classId);
    return ok({ stocks }, { stocks });
  }

  @Get('students/:studentId/portfolio')
  async portfolio(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ASSET_READERS);
    const portfolio = await this.economyService.listPortfolio(actor, studentId);
    return ok({ portfolio }, { portfolio });
  }

  @Post('students/:studentId/stocks/buy')
  async buy(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    return ok(await this.economyService.buyStock(actor, studentId, body as never));
  }

  @Post('students/:studentId/stocks/sell')
  async sell(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ['student']);
    return ok(await this.economyService.sellStock(actor, studentId, body as never));
  }

  @Post('bank/interest')
  async triggerInterest(@Req() req: Request) {
    requireActorRole(req, ['admin', 'superadmin']);
    return ok(this.economyService.triggerInterest());
  }

  @Post('teacher/stocks')
  async createStock(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, STAFF);
    return ok(await this.economyService.createStock(actor, body as never));
  }

  @Put('teacher/stocks/:id')
  async updateStock(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, STAFF);
    return ok(await this.economyService.updateStock(actor, id, body));
  }

  @Delete('teacher/stocks/:id')
  async deleteStock(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STAFF);
    return ok(await this.economyService.deleteStock(actor, id));
  }
}
