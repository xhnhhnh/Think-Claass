/**
 * challenge HTTP surface.
 *
 * Split out of `api/modules/game/game.controllers.ts` in P4.3: six independent domains
 * shared one 741-line file and one Nest module, which is what made the vertical
 * domain layout cosmetic. The body is unchanged - this is a relocation.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ChallengeService } from './challenge.service.js';
import { assertActorFeatureEnabled } from '../../utils/classFeatures.js';
import { getRequestActor } from '../../utils/requestAuth.js';
import { throwGameError } from '../../utils/gameErrors.js';
import { ok } from '../../utils/apiResponse.js';

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
