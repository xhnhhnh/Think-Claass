/**
 * gacha HTTP surface.
 *
 * Split out of `api/modules/game/game.controllers.ts` in P4.3: six independent domains
 * shared one 741-line file and one Nest module, which is what made the vertical
 * domain layout cosmetic. The body is unchanged - this is a relocation.
 */

import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';

import { GachaService } from './gacha.service.js';
import { throwGameError } from '../../utils/gameErrors.js';
import { ok } from '../../utils/apiResponse.js';

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
