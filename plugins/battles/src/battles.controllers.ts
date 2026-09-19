/**
 * battles HTTP surface.
 *
 * Relocated from `api/modules/battles/battles.controllers.ts` (itself split out of
 * `api/modules/game/game.controllers.ts` in P4.3). The 13 routes, their declaration
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
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation.
 */

import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { BattlesService } from './battles.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/battles')
export class BattlesController {
  constructor(@Inject(BattlesService) private readonly battlesService: BattlesService) {}

  @Get('classes/search')
  async searchClasses(@Query('q') q?: string, @Query('excludeClassId') excludeClassId?: string) {
    const classes = await this.battlesService.searchClasses(q, excludeClassId);
    return ok({ classes }, { classes });
  }

  @Get('teacher/:classId')
  async legacyList(@Param('classId') classId: string) {
    return { success: true, battles: await this.battlesService.listBattles(classId) };
  }

  @Post('teacher/initiate')
  async legacyInitiate(@Body() body: Record<string, any>) {
    return { success: true, ...(await this.battlesService.initiate(body as any)) };
  }

  @Put('teacher/accept/:battleId')
  async legacyAccept(@Param('battleId') battleId: string) {
    await this.battlesService.accept(battleId);
    return { success: true };
  }

  @Put('teacher/reject/:battleId')
  async legacyReject(@Param('battleId') battleId: string) {
    await this.battlesService.reject(battleId);
    return { success: true };
  }

  @Put('teacher/end/:battleId')
  async legacyEnd(@Param('battleId') battleId: string, @Body() body: Record<string, any>) {
    await this.battlesService.end(battleId, body);
    return { success: true };
  }

  @Get('stats/:battleId')
  async legacyStats(@Param('battleId') battleId: string) {
    return { success: true, ...(await this.battlesService.getStats(battleId)) };
  }

  @Get('classes/:classId')
  async list(@Param('classId') classId: string) {
    const battles = await this.battlesService.listBattles(classId);
    return ok({ battles }, { battles });
  }

  @Get(':battleId/stats')
  async stats(@Param('battleId') battleId: string) {
    const data = await this.battlesService.getStats(battleId);
    return ok(data, data);
  }

  @Post()
  async initiate(@Body() body: Record<string, any>) {
    const data = await this.battlesService.initiate(body as any);
    return ok(data, data);
  }

  @Put(':battleId/accept')
  async accept(@Param('battleId') battleId: string) {
    return ok(await this.battlesService.accept(battleId));
  }

  @Put(':battleId/reject')
  async reject(@Param('battleId') battleId: string) {
    return ok(await this.battlesService.reject(battleId));
  }

  @Put(':battleId/end')
  async end(@Param('battleId') battleId: string, @Body() body: Record<string, any>) {
    return ok(await this.battlesService.end(battleId, body));
  }
}
