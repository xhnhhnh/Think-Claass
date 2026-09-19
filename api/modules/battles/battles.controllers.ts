/**
 * battles HTTP surface.
 *
 * Split out of `api/modules/game/game.controllers.ts` in P4.3: six independent domains
 * shared one 741-line file and one Nest module, which is what made the vertical
 * domain layout cosmetic. The body is unchanged - this is a relocation.
 */

import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { BattlesService } from './battles.service.js';
import { throwGameError } from '../../utils/gameErrors.js';
import { ok } from '../../utils/apiResponse.js';

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
