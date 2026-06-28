import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { BattlesService } from '../battles/battles.service.js';
import { ChallengeService } from '../challenge/challenge.service.js';
import { DungeonService } from '../dungeon/dungeon.service.js';
import { EconomyService } from '../economy/economy.service.js';
import { GachaService } from '../gacha/gacha.service.js';
import { SlgService } from '../slg/slg.service.js';
import { assertActorFeatureEnabled } from '../../utils/classFeatures.js';
import { getRequestActor } from '../../utils/requestAuth.js';
import { throwGameError } from './game.errors.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/challenge')
export class ChallengeController {
  constructor(@Inject(ChallengeService) private readonly challengeService: ChallengeService) {}

  @Get('questions')
  legacyQuestions(@Req() req: Request, @Query('limit') limit?: string) {
    try {
      const actor = getRequestActor(req);
      if (actor.role === 'student' && actor.id) {
        assertActorFeatureEnabled(actor.id, 'student', 'enable_challenge');
      }
      return { success: true, questions: this.challengeService.getQuestions(limit) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('submit')
  legacySubmit(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.challengeService.submitAnswers(body?.studentId, body?.answers) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('boss/active/:classId')
  legacyActiveBoss(@Param('classId') classId: string) {
    try {
      return { success: true, boss: this.challengeService.getActiveBoss(classId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('boss/:id/attack')
  legacyAttackBoss(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.challengeService.attackBoss(id, body?.studentId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('boss')
  legacyListBosses() {
    try {
      return { success: true, bosses: this.challengeService.listBosses() };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('boss')
  legacyCreateBoss(@Body() body: Record<string, any>) {
    try {
      return { success: true, id: this.challengeService.createBoss(body as any).id };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Delete('boss/:id')
  legacyDeleteBoss(@Param('id') id: string) {
    try {
      this.challengeService.deleteBoss(id);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('students/:studentId/questions')
  questions(@Param('studentId') studentId: string, @Query('limit') limit?: string) {
    try {
      const questions = this.challengeService.getQuestions(limit, studentId);
      return ok({ questions }, { questions });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/submissions')
  submissions(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const data = this.challengeService.submitAnswers(studentId, body?.answers);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('classes/:classId/bosses/active')
  activeBoss(@Param('classId') classId: string) {
    try {
      const boss = this.challengeService.getActiveBoss(classId);
      return ok({ boss }, { boss });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('bosses')
  bosses() {
    try {
      const bosses = this.challengeService.listBosses();
      return ok({ bosses }, { bosses });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('bosses')
  createBoss(@Body() body: Record<string, any>) {
    try {
      return ok(this.challengeService.createBoss(body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Delete('bosses/:id')
  deleteBoss(@Param('id') id: string) {
    try {
      return ok(this.challengeService.deleteBoss(id));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('bosses/:id/attacks')
  attackBoss(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      const data = this.challengeService.attackBoss(id, body?.studentId);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }
}

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

@Controller('api/dungeon')
export class DungeonController {
  constructor(@Inject(DungeonService) private readonly dungeonService: DungeonService) {}

  @Get('students/:studentId/run')
  run(@Param('studentId') studentId: string) {
    try {
      const data = this.dungeonService.getRun(studentId);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/start')
  start(@Param('studentId') studentId: string) {
    try {
      const data = this.dungeonService.startRun(studentId);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/choices')
  choose(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const data = this.dungeonService.choose(studentId, body);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/abandon')
  abandon(@Param('studentId') studentId: string) {
    try {
      return ok(this.dungeonService.abandon(studentId));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get(':studentId')
  legacyRun(@Param('studentId') studentId: string) {
    try {
      return { success: true, ...this.dungeonService.getRun(studentId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('start/:studentId')
  legacyStart(@Param('studentId') studentId: string) {
    try {
      return { success: true, ...this.dungeonService.startRun(studentId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('choice/:studentId')
  legacyChoice(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.dungeonService.choose(studentId, body) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('abandon/:studentId')
  legacyAbandon(@Param('studentId') studentId: string) {
    try {
      this.dungeonService.abandon(studentId);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }
}

@Controller('api/gacha')
export class GachaController {
  constructor(@Inject(GachaService) private readonly gachaService: GachaService) {}

  @Get('dictionary')
  dictionary() {
    try {
      const pets = this.gachaService.listDictionary();
      return ok({ pets }, { pets });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('dictionary')
  createDictionary(@Body() body: Record<string, any>) {
    try {
      return ok(this.gachaService.createDictionary(body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('pools/:classId')
  legacyPools(@Param('classId') classId: string) {
    try {
      return { success: true, pools: this.gachaService.listPools(classId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('draw/:studentId')
  legacyDraw(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, results: this.gachaService.draw(studentId, body as any) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('collection/:studentId')
  legacyCollection(@Param('studentId') studentId: string) {
    try {
      return { success: true, collection: this.gachaService.listCollection(studentId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put('active/:studentId/:instanceId')
  legacyActivePet(@Param('studentId') studentId: string, @Param('instanceId') instanceId: string) {
    try {
      this.gachaService.setActivePet(studentId, instanceId);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('classes/:classId/pools')
  pools(@Param('classId') classId: string) {
    try {
      const pools = this.gachaService.listPools(classId);
      return ok({ pools }, { pools });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/draws')
  draw(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    try {
      const results = this.gachaService.draw(studentId, body as any);
      return ok({ results }, { results });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('students/:studentId/collection')
  collection(@Param('studentId') studentId: string) {
    try {
      const collection = this.gachaService.listCollection(studentId);
      return ok({ collection }, { collection });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put('students/:studentId/active-pet/:instanceId')
  activePet(@Param('studentId') studentId: string, @Param('instanceId') instanceId: string) {
    try {
      return ok(this.gachaService.setActivePet(studentId, instanceId));
    } catch (error) {
      throwGameError(error);
    }
  }
}

@Controller('api/battles')
export class BattlesController {
  constructor(@Inject(BattlesService) private readonly battlesService: BattlesService) {}

  @Get('classes/search')
  searchClasses(@Query('q') q?: string, @Query('excludeClassId') excludeClassId?: string) {
    try {
      const classes = this.battlesService.searchClasses(q, excludeClassId);
      return ok({ classes }, { classes });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('teacher/:classId')
  legacyList(@Param('classId') classId: string) {
    try {
      return { success: true, battles: this.battlesService.listBattles(classId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('teacher/initiate')
  legacyInitiate(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.battlesService.initiate(body as any) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put('teacher/accept/:battleId')
  legacyAccept(@Param('battleId') battleId: string) {
    try {
      this.battlesService.accept(battleId);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put('teacher/reject/:battleId')
  legacyReject(@Param('battleId') battleId: string) {
    try {
      this.battlesService.reject(battleId);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put('teacher/end/:battleId')
  legacyEnd(@Param('battleId') battleId: string, @Body() body: Record<string, any>) {
    try {
      this.battlesService.end(battleId, body);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('stats/:battleId')
  legacyStats(@Param('battleId') battleId: string) {
    try {
      return { success: true, ...this.battlesService.getStats(battleId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('classes/:classId')
  list(@Param('classId') classId: string) {
    try {
      const battles = this.battlesService.listBattles(classId);
      return ok({ battles }, { battles });
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get(':battleId/stats')
  stats(@Param('battleId') battleId: string) {
    try {
      const data = this.battlesService.getStats(battleId);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post()
  initiate(@Body() body: Record<string, any>) {
    try {
      const data = this.battlesService.initiate(body as any);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put(':battleId/accept')
  accept(@Param('battleId') battleId: string) {
    try {
      return ok(this.battlesService.accept(battleId));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put(':battleId/reject')
  reject(@Param('battleId') battleId: string) {
    try {
      return ok(this.battlesService.reject(battleId));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Put(':battleId/end')
  end(@Param('battleId') battleId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.battlesService.end(battleId, body));
    } catch (error) {
      throwGameError(error);
    }
  }
}

@Controller('api/slg')
export class SlgController {
  constructor(@Inject(SlgService) private readonly slgService: SlgService) {}

  @Get('map/:classId')
  legacyMap(@Param('classId') classId: string) {
    try {
      return { success: true, ...this.slgService.getMap(classId) };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('student/:studentId/contribute/:territoryId')
  legacyContribute(@Param('studentId') studentId: string, @Param('territoryId') territoryId: string, @Body() body: Record<string, any>) {
    try {
      this.slgService.contribute(studentId, territoryId, body as any);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('teacher')
  legacyCreateTerritory(@Body() body: Record<string, any>) {
    try {
      this.slgService.createTerritory(body as any);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('teacher/yield/:classId')
  legacyYield(@Param('classId') classId: string) {
    try {
      this.slgService.yieldResources(classId);
      return { success: true };
    } catch (error) {
      throwGameError(error);
    }
  }

  @Get('classes/:classId/map')
  map(@Param('classId') classId: string) {
    try {
      const data = this.slgService.getMap(classId);
      return ok(data, data);
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('students/:studentId/territories/:territoryId/contributions')
  contribute(@Param('studentId') studentId: string, @Param('territoryId') territoryId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.slgService.contribute(studentId, territoryId, body as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('classes/:classId/territories')
  createTerritory(@Param('classId') classId: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.slgService.createTerritory({ ...body, class_id: Number(classId) } as any));
    } catch (error) {
      throwGameError(error);
    }
  }

  @Post('classes/:classId/yield')
  yieldResources(@Param('classId') classId: string) {
    try {
      return ok(this.slgService.yieldResources(classId));
    } catch (error) {
      throwGameError(error);
    }
  }
}
