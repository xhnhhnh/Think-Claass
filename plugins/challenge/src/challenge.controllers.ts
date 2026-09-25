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
 * Authorization is enforced here now. Thirteen of these fourteen routes were anonymous: an
 * unnamed caller could author and delete bosses, submit answers as any student and attack a boss
 * on any student's behalf. The matrix is the rule - boss authoring/deletion is teacher/admin, the
 * global boss list is readable by any signed-in caller, and every student- or class-scoped route
 * resolves the claim from the actor (`ChallengeService.assertStudentAction` /
 * `assertClassAccess`) rather than from the URL or body. `GET /questions` keeps the single gate it
 * already had and is deliberately not re-gated.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext } from '@thinkclass/kernel';

import { requireActor, requireActorRole } from './challenge.authorization.js';
import { ChallengeService } from './challenge.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/** Authoring and deleting world bosses is the teacher's console - students never write them. */
const BOSS_ADMINS = ['teacher', 'admin', 'superadmin'];
/** Anything scoped to one student or one class: the student, a teacher, staff admin. */
const SIGNED_IN = ['student', 'teacher', 'admin', 'superadmin'];

@Controller('api/challenge')
export class ChallengeController {
  constructor(@Inject(ChallengeService) private readonly challengeService: ChallengeService) {}

  /**
   * The question bank, for a signed-in student taking a challenge.
   *
   * The pre-migration controller resolved the caller through `getRequestActor(req)` and, for a
   * student, checked their class flag. That is now `assertActorCanReadQuestions`, which resolves
   * user id -> student through `classroom.public` rather than reading `students`.
   *
   * `requireActorRole` was added by the authorization round. The matrix recorded this route as
   * half-controlled - "a student is checked, other callers are not" - and that reading was correct:
   * the guard below was `if (actor && role === 'student')`, so the *anonymous* case fell through
   * untouched and the whole question bank answered 200 to anyone who asked. Every caller is now
   * signed in, and a student is additionally gated on their class's `enable_challenge` flag.
   *
   * The kernel's request-context middleware is installed ahead of every route in both compositions,
   * so `getRequestContext` throwing here means the host is assembled wrongly; failing loudly is
   * safer than silently dropping a feature gate.
   */
  @Get('questions')
  async legacyQuestions(@Req() req: Request, @Query('limit') limit?: string) {
    const actor = requireActorRole(req, SIGNED_IN);
    if (actor.role === 'student') {
      await this.challengeService.assertActorCanReadQuestions(actor.id as number);
    }
    return { success: true, questions: await this.challengeService.getQuestions(limit) };
  }

  @Post('submit')
  async legacySubmit(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertStudentAction(actor, body?.studentId);
    return { success: true, ...(await this.challengeService.submitAnswers(body?.studentId, body?.answers)) };
  }

  @Get('boss/active/:classId')
  async legacyActiveBoss(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertClassAccess(actor, classId);
    return { success: true, boss: await this.challengeService.getActiveBoss(classId) };
  }

  @Post('boss/:id/attack')
  async legacyAttackBoss(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertStudentAction(actor, body?.studentId);
    return { success: true, ...(await this.challengeService.attackBoss(id, body?.studentId)) };
  }

  @Get('boss')
  async legacyListBosses(@Req() req: Request) {
    requireActor(req);
    return { success: true, bosses: this.challengeService.listBosses() };
  }

  @Post('boss')
  async legacyCreateBoss(@Req() req: Request, @Body() body: Record<string, any>) {
    requireActorRole(req, BOSS_ADMINS);
    return { success: true, id: this.challengeService.createBoss(body as any).id };
  }

  @Delete('boss/:id')
  async legacyDeleteBoss(@Req() req: Request, @Param('id') id: string) {
    requireActorRole(req, BOSS_ADMINS);
    this.challengeService.deleteBoss(id);
    return { success: true };
  }

  @Get('students/:studentId/questions')
  async questions(@Req() req: Request, @Param('studentId') studentId: string, @Query('limit') limit?: string) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertStudentAction(actor, studentId);
    const questions = await this.challengeService.getQuestions(limit, studentId);
    return ok({ questions }, { questions });
  }

  @Post('students/:studentId/submissions')
  async submissions(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Body() body: Record<string, any>,
  ) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertStudentAction(actor, studentId);
    const data = await this.challengeService.submitAnswers(studentId, body?.answers);
    return ok(data, data);
  }

  @Get('classes/:classId/bosses/active')
  async activeBoss(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertClassAccess(actor, classId);
    const boss = await this.challengeService.getActiveBoss(classId);
    return ok({ boss }, { boss });
  }

  @Get('bosses')
  async bosses(@Req() req: Request) {
    requireActor(req);
    const bosses = this.challengeService.listBosses();
    return ok({ bosses }, { bosses });
  }

  @Post('bosses')
  async createBoss(@Req() req: Request, @Body() body: Record<string, any>) {
    requireActorRole(req, BOSS_ADMINS);
    return ok(this.challengeService.createBoss(body as any));
  }

  @Delete('bosses/:id')
  async deleteBoss(@Req() req: Request, @Param('id') id: string) {
    requireActorRole(req, BOSS_ADMINS);
    return ok(this.challengeService.deleteBoss(id));
  }

  @Post('bosses/:id/attacks')
  async attackBoss(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, SIGNED_IN);
    await this.challengeService.assertStudentAction(actor, body?.studentId);
    const data = await this.challengeService.attackBoss(id, body?.studentId);
    return ok(data, data);
  }
}
