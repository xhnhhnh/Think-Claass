/**
 * slg HTTP surface.
 *
 * Split out of `api/modules/game/game.controllers.ts` in P4.3: six independent domains
 * shared one 741-line file and one Nest module, which is what made the vertical
 * domain layout cosmetic. The body is unchanged - this is a relocation.
 */

import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';

import { SlgService } from './slg.service.js';
import { throwGameError } from '../../utils/gameErrors.js';
import { ok } from '../../utils/apiResponse.js';

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
