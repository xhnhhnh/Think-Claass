/**
 * economy HTTP surface.
 *
 * Split out of `api/modules/game/game.controllers.ts` in P4.3: six independent domains
 * shared one 741-line file and one Nest module, which is what made the vertical
 * domain layout cosmetic. The body is unchanged - this is a relocation.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { EconomyService } from './economy.service.js';
import { throwGameError } from '../../utils/gameErrors.js';
import { ok } from '../../utils/apiResponse.js';

@Controller('api/economy')
export class EconomyController {
  constructor(@Inject(EconomyService) private readonly economyService: EconomyService) {}

  @Post('bank/trigger-interest')
  legacyTriggerInterest() {
    try {
      this.economyService.triggerInterest();
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('bank/:studentId')
  legacyBank(@Param('studentId') studentId: string) {
    try {
      return { success: true, account: this.economyService.getBankAccount(studentId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('bank/deposit/:studentId')
  legacyDeposit(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      this.economyService.deposit(studentId, body as any);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('bank/withdraw/:studentId')
  legacyWithdraw(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      this.economyService.withdraw(studentId, body as any);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('stocks/:classId')
  legacyStocks(@Param('classId') classId: string) {
    try {
      return { success: true, stocks: this.economyService.listStocks(classId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('portfolio/:studentId')
  legacyPortfolio(@Param('studentId') studentId: string) {
    try {
      return { success: true, portfolio: this.economyService.listPortfolio(studentId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('stocks/buy/:studentId')
  legacyBuy(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      this.economyService.buyStock(studentId, body as any);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('stocks/sell/:studentId')
  legacySell(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      this.economyService.sellStock(studentId, body as any);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('students/:studentId/overview')
  overview(@Param('studentId') studentId: string, @Query('classId') classId?: string) {
    try {
      return ok(this.economyService.getStudentOverview(studentId, classId));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('students/:studentId/bank')
  bank(@Param('studentId') studentId: string) {
    try {
      const account = this.economyService.getBankAccount(studentId);
      return ok({ account }, { account });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/bank/deposits')
  deposit(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.economyService.deposit(studentId, body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/bank/withdrawals')
  withdraw(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.economyService.withdraw(studentId, body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('classes/:classId/stocks')
  stocks(@Param('classId') classId: string) {
    try {
      const stocks = this.economyService.listStocks(classId);
      return ok({ stocks }, { stocks });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('students/:studentId/portfolio')
  portfolio(@Param('studentId') studentId: string) {
    try {
      const portfolio = this.economyService.listPortfolio(studentId);
      return ok({ portfolio }, { portfolio });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/stocks/buy')
  buy(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.economyService.buyStock(studentId, body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/stocks/sell')
  sell(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.economyService.sellStock(studentId, body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('bank/interest')
  triggerInterest() {
    try {
      return ok(this.economyService.triggerInterest());
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('teacher/stocks')
  createStock(@Body() body: Record<string, any>) {
    try {
      return ok(this.economyService.createStock(body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put('teacher/stocks/:id')
  updateStock(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.economyService.updateStock(id, body));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Delete('teacher/stocks/:id')
  deleteStock(@Param('id') id: string) {
    try {
      return ok(this.economyService.deleteStock(id));
    } catch (error) {
      throwGameError(error);
    }
  }
}
