/**
 * Gacha HTTP surface.
 *
 * Relocated from `api/modules/gacha/gacha.controllers.ts` (itself split out of
 * `api/modules/game/game.controllers.ts` in P4.3). Routes and response shapes are
 * unchanged: the endpoint snapshot and the deployed frontend both depend on them.
 *
 * Two envelope styles coexist and both are deliberate:
 *
 *   - the six legacy `/dictionary`, `/pools/:classId`, `/draw/:studentId`,
 *     `/collection/:studentId`, `/active/:studentId/:instanceId` routes answer
 *     `{ success, ...payload }` with NO `data` key;
 *   - the newer `/classes/*`, `/students/*` routes answer through `ok()`, i.e.
 *     `{ success, data, ...legacyPayload }`, duplicating the payload at the top level
 *     for older clients.
 *
 * Collapsing either into the other is a breaking API change, not a cleanup.
 *
 * The pre-migration controller wrapped every handler in `try { ... } catch (error) {
 * throwGameError(error) }`. That translation is gone on purpose: the kernel's global
 * filter renders the `ApiError` this plugin throws into the same envelope (see
 * `api/app.ts`), and importing `api/utils/gameErrors.js` would make the plugin depend
 * on legacy code guardrail G1 forbids. One nuance follows from that: a *non*-ApiError
 * failure used to surface its own message in the 500 body and now renders the
 * kernel's generic internal-error message. Statuses are unchanged.
 *
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation. Adding checks here would silently change the
 * contract this round is supposed to preserve.
 */

import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';

import { GachaService } from './gacha.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/gacha')
export class GachaController {
  constructor(@Inject(GachaService) private readonly gachaService: GachaService) {}

  @Get('dictionary')
  async dictionary() {
    const pets = await this.gachaService.listDictionary();
    return ok({ pets }, { pets });
  }

  @Post('dictionary')
  async createDictionary(@Body() body: Record<string, any>) {
    return ok(await this.gachaService.createDictionary(body as any));
  }

  @Get('pools/:classId')
  async legacyPools(@Param('classId') classId: string) {
    return { success: true, pools: await this.gachaService.listPools(classId) };
  }

  @Post('draw/:studentId')
  async legacyDraw(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    return { success: true, results: await this.gachaService.draw(studentId, body as any) };
  }

  @Get('collection/:studentId')
  async legacyCollection(@Param('studentId') studentId: string) {
    return { success: true, collection: await this.gachaService.listCollection(studentId) };
  }

  @Put('active/:studentId/:instanceId')
  async legacyActivePet(@Param('studentId') studentId: string, @Param('instanceId') instanceId: string) {
    await this.gachaService.setActivePet(studentId, instanceId);
    return { success: true };
  }

  @Get('classes/:classId/pools')
  async pools(@Param('classId') classId: string) {
    const pools = await this.gachaService.listPools(classId);
    return ok({ pools }, { pools });
  }

  @Post('students/:studentId/draws')
  async draw(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const results = await this.gachaService.draw(studentId, body as any);
    return ok({ results }, { results });
  }

  @Get('students/:studentId/collection')
  async collection(@Param('studentId') studentId: string) {
    const collection = await this.gachaService.listCollection(studentId);
    return ok({ collection }, { collection });
  }

  @Put('students/:studentId/active-pet/:instanceId')
  async activePet(@Param('studentId') studentId: string, @Param('instanceId') instanceId: string) {
    return ok(await this.gachaService.setActivePet(studentId, instanceId));
  }
}
