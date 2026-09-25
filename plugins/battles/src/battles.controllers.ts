/**
 * battles HTTP surface.
 *
 * Relocated from `api/modules/battles/battles.controllers.ts` (itself split out of
 * `api/modules/game/game.controllers.ts` in P4.3b). The 13 routes, their declaration
 * order, their two envelope styles and their response shapes are unchanged: the endpoint
 * snapshot and the deployed frontend both depend on them.
 *
 * Two envelope styles coexist and both are deliberate:
 *
 *   - the `teacher/*` and `stats/*` legacy aliases answer `{ success, ...payload }`
 *     with NO `data` key, and discard the service result where the pre-migration
 *     controller did;
 *   - the `classes/*`, `:battleId/*` and `POST /api/battles` routes answer through
 *     `ok()`, i.e. `{ success, data, ...legacyPayload }`, duplicating the payload at the
 *     top level for older clients.
 *
 * Collapsing either into the other is a breaking API change, not a cleanup.
 *
 * `throwGameError` is gone: it translated the *legacy* `api/utils/apiError.ts` class,
 * which a plugin cannot reach (and whose `instanceof` check would fail anyway). This
 * plugin throws the kernel's `ApiError`, and the composition's global filter
 * (`api/app.ts` in legacy mode, `plugin-runtime/src/host.ts` in kernel mode) renders it
 * into the same `{ success: false, message }` envelope with the same status.
 *
 * Authorization is enforced here now, in the matrix's two layers: the role gate answers 401
 * for an anonymous caller and 403 for a role that may not call the route, and
 * `BattlesService.assert*` answers 403 for a caller who is known but not part of this class or
 * battle. Battles are teacher-vs-teacher, so every write is a teacher of a participating class
 * (staff admin passes) and reads are the participating teachers, the students in those classes and
 * staff admin - never an anonymous class enumerator, which is what the search route used to be.
 */

import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { requireActorRole } from './battles.authorization.js';
import { BattlesService } from './battles.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/** The class search feeds the battle picker: teachers and the admin console. */
const SEARCHERS = ['teacher', 'admin', 'superadmin'];
/** A class's battle list / a battle's stats: its teachers, its students, staff admin. */
const READERS = ['teacher', 'student', 'admin', 'superadmin'];
/** Starting, accepting, rejecting and ending a battle: a participating class's teacher. */
const WRITERS = ['teacher', 'admin', 'superadmin'];

@Controller('api/battles')
export class BattlesController {
  constructor(@Inject(BattlesService) private readonly battlesService: BattlesService) {}

  @Get('classes/search')
  async searchClasses(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('excludeClassId') excludeClassId?: string,
  ) {
    requireActorRole(req, SEARCHERS);
    const classes = await this.battlesService.searchClasses(q, excludeClassId);
    return ok({ classes }, { classes });
  }

  @Get('teacher/:classId')
  async legacyList(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, READERS);
    await this.battlesService.assertClassAccess(actor, classId);
    return { success: true, battles: await this.battlesService.listBattles(classId) };
  }

  @Post('teacher/initiate')
  async legacyInitiate(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertInitiatorClass(actor, body?.initiator_class_id);
    return { success: true, ...(await this.battlesService.initiate(body as any)) };
  }

  @Put('teacher/accept/:battleId')
  async legacyAccept(@Req() req: Request, @Param('battleId') battleId: string) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertBattleTeacher(actor, battleId);
    await this.battlesService.accept(battleId);
    return { success: true };
  }

  @Put('teacher/reject/:battleId')
  async legacyReject(@Req() req: Request, @Param('battleId') battleId: string) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertBattleTeacher(actor, battleId);
    await this.battlesService.reject(battleId);
    return { success: true };
  }

  @Put('teacher/end/:battleId')
  async legacyEnd(@Req() req: Request, @Param('battleId') battleId: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertBattleTeacher(actor, battleId);
    await this.battlesService.end(battleId, body);
    return { success: true };
  }

  @Get('stats/:battleId')
  async legacyStats(@Req() req: Request, @Param('battleId') battleId: string) {
    const actor = requireActorRole(req, READERS);
    await this.battlesService.assertBattleAccess(actor, battleId);
    return { success: true, ...(await this.battlesService.getStats(battleId)) };
  }

  @Get('classes/:classId')
  async list(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, READERS);
    await this.battlesService.assertClassAccess(actor, classId);
    const battles = await this.battlesService.listBattles(classId);
    return ok({ battles }, { battles });
  }

  @Get(':battleId/stats')
  async stats(@Req() req: Request, @Param('battleId') battleId: string) {
    const actor = requireActorRole(req, READERS);
    await this.battlesService.assertBattleAccess(actor, battleId);
    const data = await this.battlesService.getStats(battleId);
    return ok(data, data);
  }

  @Post()
  async initiate(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertInitiatorClass(actor, body?.initiator_class_id);
    const data = await this.battlesService.initiate(body as any);
    return ok(data, data);
  }

  @Put(':battleId/accept')
  async accept(@Req() req: Request, @Param('battleId') battleId: string) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertBattleTeacher(actor, battleId);
    return ok(await this.battlesService.accept(battleId));
  }

  @Put(':battleId/reject')
  async reject(@Req() req: Request, @Param('battleId') battleId: string) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertBattleTeacher(actor, battleId);
    return ok(await this.battlesService.reject(battleId));
  }

  @Put(':battleId/end')
  async end(@Req() req: Request, @Param('battleId') battleId: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, WRITERS);
    await this.battlesService.assertBattleTeacher(actor, battleId);
    return ok(await this.battlesService.end(battleId, body));
  }
}
