/**
 * dungeon HTTP surface.
 *
 * Split out of `api/modules/game/game.controllers.ts` in P4.3: six independent domains
 * shared one 741-line file and one Nest module, which is what made the vertical
 * domain layout cosmetic. The body is unchanged - this is a relocation.
 */

import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';

import { DungeonService } from './dungeon.service.js';
import { throwGameError } from '../../utils/gameErrors.js';
import { ok } from '../../utils/apiResponse.js';

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
