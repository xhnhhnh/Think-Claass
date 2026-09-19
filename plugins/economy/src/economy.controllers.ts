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
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation. Adding checks here would silently change the
 * contract this round is supposed to preserve.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { EconomyService } from './economy.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/economy')
export class EconomyController {
  constructor(@Inject(EconomyService) private readonly economyService: EconomyService) {}

  @Post('bank/trigger-interest')
  async legacyTriggerInterest() {
    this.economyService.triggerInterest();
    return { success: true };
  }

  @Get('bank/:studentId')
  async legacyBank(@Param('studentId') studentId: string) {
    return { success: true, account: await this.economyService.getBankAccount(studentId) };
  }

  @Post('bank/deposit/:studentId')
  async legacyDeposit(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    await this.economyService.deposit(studentId, body);
    return { success: true };
  }

  @Post('bank/withdraw/:studentId')
  async legacyWithdraw(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    await this.economyService.withdraw(studentId, body);
    return { success: true };
  }

  @Get('stocks/:classId')
  async legacyStocks(@Param('classId') classId: string) {
    return { success: true, stocks: await this.economyService.listStocks(classId) };
  }

  @Get('portfolio/:studentId')
  async legacyPortfolio(@Param('studentId') studentId: string) {
    return { success: true, portfolio: await this.economyService.listPortfolio(studentId) };
  }

  @Post('stocks/buy/:studentId')
  async legacyBuy(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    await this.economyService.buyStock(studentId, body as never);
    return { success: true };
  }

  @Post('stocks/sell/:studentId')
  async legacySell(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    await this.economyService.sellStock(studentId, body as never);
    return { success: true };
  }

  @Get('students/:studentId/overview')
  async overview(@Param('studentId') studentId: string, @Query('classId') classId?: string) {
    return ok(await this.economyService.getStudentOverview(studentId, classId));
  }

  @Get('students/:studentId/bank')
  async bank(@Param('studentId') studentId: string) {
    const account = await this.economyService.getBankAccount(studentId);
    return ok({ account }, { account });
  }

  @Post('students/:studentId/bank/deposits')
  async deposit(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    return ok(await this.economyService.deposit(studentId, body));
  }

  @Post('students/:studentId/bank/withdrawals')
  async withdraw(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    return ok(await this.economyService.withdraw(studentId, body));
  }

  @Get('classes/:classId/stocks')
  async stocks(@Param('classId') classId: string) {
    const stocks = await this.economyService.listStocks(classId);
    return ok({ stocks }, { stocks });
  }

  @Get('students/:studentId/portfolio')
  async portfolio(@Param('studentId') studentId: string) {
    const portfolio = await this.economyService.listPortfolio(studentId);
    return ok({ portfolio }, { portfolio });
  }

  @Post('students/:studentId/stocks/buy')
  async buy(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    return ok(await this.economyService.buyStock(studentId, body as never));
  }

  @Post('students/:studentId/stocks/sell')
  async sell(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    return ok(await this.economyService.sellStock(studentId, body as never));
  }

  @Post('bank/interest')
  async triggerInterest() {
    return ok(this.economyService.triggerInterest());
  }

  @Post('teacher/stocks')
  async createStock(@Body() body: Record<string, unknown>) {
    return ok(await this.economyService.createStock(body as never));
  }

  @Put('teacher/stocks/:id')
  async updateStock(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok(await this.economyService.updateStock(id, body));
  }

  @Delete('teacher/stocks/:id')
  async deleteStock(@Param('id') id: string) {
    return ok(await this.economyService.deleteStock(id));
  }
}
