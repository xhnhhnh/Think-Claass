/**
 * ai-study HTTP surface - six routes, two controllers.
 *
 * Both controllers follow the house conventions the other plugins established, and each one is a
 * deliberate choice rather than a copy:
 *
 *   - **The full path is on the decorator** (`api/ai-study/...`), and `ok(data)` answers
 *     `{ success: true, data }` with no flattened duplicate keys. These are new routes, so unlike
 *     `plugins/assignments` there is no legacy envelope to preserve.
 *   - **No `@HttpCode`**: Nest's defaults (POST 201, PUT 200) are the contract, as in
 *     `plugins/homework`.
 *   - **The role gate runs first, in the handler, before any validation.** 401
 *     未登录或登录已过期 for a request with no verified actor, 403 无权限执行该操作 for a role the
 *     route does not list. Then the declared capability through `ctx.permissions.require`, which
 *     fails closed on an undeclared key - a typo must deny, not grant.
 *   - **Student routes carry no `:studentId`.** The student behind the caller comes from their login
 *     through the classroom port, so there is no path parameter to forge; `sets/:id` is the only id a
 *     student ever supplies, and the service checks it against their own row.
 */

import { Body, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { PLUGIN_CONTEXT, type KernelContext } from '@thinkclass/plugin-sdk';
import { getRequestContext } from '@thinkclass/kernel';

import { AiStudyService } from './ai-study.service.js';
import { requireActorRole, type AiStudyActor } from './ai-study.authorization.js';

/** The envelope every route here answers with. */
function ok<T>(data: T) {
  return { success: true as const, data };
}

/**
 * Enforce the capability a route declares in the manifest.
 *
 * The raw kernel actor is passed straight through: the engine infers the scope chain from the actor's
 * own ids, which is what "declared on the route, assigned per class or per student" means. A missing
 * actor cannot reach here - the role gate above has already refused it.
 */
function requirePermission(
  ctx: KernelContext,
  req: Request,
  key: string,
  scope?: { type: 'class' | 'student'; id: number },
): void {
  const { actor } = getRequestContext(req);
  if (!actor) return;
  ctx.permissions.require(actor, key, scope);
}

@Controller('api/ai-study')
export class AiStudyStudentController {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly ctx: KernelContext,
    @Inject(AiStudyService) private readonly service: AiStudyService,
  ) {}

  /**
   * 生成今日智学.
   *
   * Idempotent while a set is open (the service returns it rather than replacing it), and answers
   * `set: null` with a reason when the question bank holds nothing to practise - never an empty set,
   * which the "one open set" rule would turn into a stuck student.
   */
  @Post('my/sets')
  async generateMySet(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const actor: AiStudyActor = requireActorRole(req, ['student']);
    requirePermission(this.ctx, req, 'ai_study.practice');
    return ok(await this.service.generateMySet(actor, body ?? {}));
  }

  /** The student's current set, or `null` - the page's normal empty state, not a 404. */
  @Get('my/sets/current')
  async currentMySet(@Req() req: Request) {
    const actor: AiStudyActor = requireActorRole(req, ['student']);
    requirePermission(this.ctx, req, 'ai_study.practice');
    return ok(await this.service.currentMySet(actor));
  }

  /** Save answers without submitting. */
  @Put('sets/:id/answers')
  async saveAnswers(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const actor: AiStudyActor = requireActorRole(req, ['student']);
    requirePermission(this.ctx, req, 'ai_study.practice');
    return ok(await this.service.saveAnswers(actor, id, body ?? {}));
  }

  /**
   * Submit: every saved answer goes to the question's owner for judgement, then the set closes.
   *
   * Unanswered items are neither correct nor wrong, and a question the owner declines to judge lands
   * in `pending` without moving the student's mastery - see the service.
   */
  @Post('sets/:id/submit')
  async submitSet(@Req() req: Request, @Param('id') id: string) {
    const actor: AiStudyActor = requireActorRole(req, ['student']);
    requirePermission(this.ctx, req, 'ai_study.practice');
    return ok(await this.service.submitSet(actor, id));
  }
}

@Controller('api/ai-study/classes')
export class AiStudyTeacherController {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly ctx: KernelContext,
    @Inject(AiStudyService) private readonly service: AiStudyService,
  ) {}

  /** The class board: which knowledge nodes the class is missing, and who needs what next. */
  @Get(':classId/insight')
  async classInsight(@Req() req: Request, @Param('classId') classId: string) {
    const actor: AiStudyActor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    requirePermission(this.ctx, req, 'ai_study.insight', { type: 'class', id: Number(classId) });
    return ok(await this.service.classInsight(actor, classId));
  }

  /** Dispatch a practice set to the selected students of this class. */
  @Post(':classId/assign')
  async assign(@Req() req: Request, @Param('classId') classId: string, @Body() body: Record<string, unknown>) {
    const actor: AiStudyActor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    requirePermission(this.ctx, req, 'ai_study.assign', { type: 'class', id: Number(classId) });
    return ok(await this.service.assign(actor, classId, body ?? {}));
  }
}
