/**
 * Challenge HTTP surface.
 *
 * Relocated from `api/modules/challenge/challenge.controllers.ts`. Paths, methods and
 * response shapes are unchanged: the endpoint snapshot (292 endpoints) and the
 * deployed frontend both depend on them.
 *
 * Two envelope styles coexist and both are deliberate:
 *
 *   - the seven legacy aliases (`/questions`, `/submit`, `/boss*`) answer
 *     `{ success, ...payload }` with NO `data` key, and discard the service result
 *     where the original did;
 *   - the seven newer routes (`/students/*`, `/classes/*`, `/bosses*`) answer through
 *     `ok()`, i.e. `{ success, data, ...legacyPayload }`, duplicating the payload at
 *     the top level for older clients.
 *
 * Collapsing either into the other is a breaking API change, not a cleanup.
 *
 * Two things changed shape with the migration, and only two:
 *
 *   1. the handlers are `async`, because the service now reaches `students` and
 *      `records` through `classroom.public`;
 *   2. the `try/catch -> throwGameError` wrapper is gone. That translator existed to
 *      turn the legacy `api/utils/apiError.ts` class into a Nest `HttpException`; this
 *      plugin throws the kernel's `ApiError`, which both compositions render through
 *      the same envelope with the same status (legacy `api/app.ts`
 *      `useGlobalFilters` -> `renderError`). Keeping the wrapper would mean importing
 *      `api/**` and would also mis-translate the kernel class.
 *
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext } from '@thinkclass/kernel';

import { ChallengeService } from './challenge.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/challenge')
export class ChallengeController {
  constructor(@Inject(ChallengeService) private readonly challengeService: ChallengeService) {}

  /**
   * The only actor-gated route in this domain.
   *
   * The pre-migration controller resolved the caller through
   * `getRequestActor(req)` and, for a student, checked their class flag. That is now
   * `ChallengeService.assertActorCanReadQuestions`, which resolves user id -> student
   * through `classroom.public` rather than reading `students`.
   *
   * The kernel's request-context middleware is installed ahead of every route in both
   * compositions, so `getRequestContext` throwing here means the host is assembled
   * wrongly; failing loudly is safer than silently dropping a feature gate.
   */
  @Get('questions')
  async legacyQuestions(@Req() req: Request, @Query('limit') limit?: string) {
    const actor = getRequestContext(req).actor;
    if (actor && actor.role === 'student' && actor.userId) {
      await this.challengeService.assertActorCanReadQuestions(actor.userId);
    }
    return { success: true, questions: await this.challengeService.getQuestions(limit) };
  }

  @Post('submit')
  async legacySubmit(@Body() body: Record<string, any>) {
    return { success: true, ...(await this.challengeService.submitAnswers(body?.studentId, body?.answers)) };
  }

  @Get('boss/active/:classId')
  async legacyActiveBoss(@Param('classId') classId: string) {
    return { success: true, boss: await this.challengeService.getActiveBoss(classId) };
  }

  @Post('boss/:id/attack')
  async legacyAttackBoss(@Param('id') id: string, @Body() body: Record<string, any>) {
    return { success: true, ...(await this.challengeService.attackBoss(id, body?.studentId)) };
  }

  @Get('boss')
  async legacyListBosses() {
    return { success: true, bosses: this.challengeService.listBosses() };
  }

  @Post('boss')
  async legacyCreateBoss(@Body() body: Record<string, any>) {
    return { success: true, id: this.challengeService.createBoss(body as any).id };
  }

  @Delete('boss/:id')
  async legacyDeleteBoss(@Param('id') id: string) {
    this.challengeService.deleteBoss(id);
    return { success: true };
  }

  @Get('students/:studentId/questions')
  async questions(@Param('studentId') studentId: string, @Query('limit') limit?: string) {
    const questions = await this.challengeService.getQuestions(limit, studentId);
    return ok({ questions }, { questions });
  }

  @Post('students/:studentId/submissions')
  async submissions(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const data = await this.challengeService.submitAnswers(studentId, body?.answers);
    return ok(data, data);
  }

  @Get('classes/:classId/bosses/active')
  async activeBoss(@Param('classId') classId: string) {
    const boss = await this.challengeService.getActiveBoss(classId);
    return ok({ boss }, { boss });
  }

  @Get('bosses')
  async bosses() {
    const bosses = this.challengeService.listBosses();
    return ok({ bosses }, { bosses });
  }

  @Post('bosses')
  async createBoss(@Body() body: Record<string, any>) {
    return ok(this.challengeService.createBoss(body as any));
  }

  @Delete('bosses/:id')
  async deleteBoss(@Param('id') id: string) {
    return ok(this.challengeService.deleteBoss(id));
  }

  @Post('bosses/:id/attacks')
  async attackBoss(@Param('id') id: string, @Body() body: Record<string, any>) {
    const data = await this.challengeService.attackBoss(id, body?.studentId);
    return ok(data, data);
  }
}
