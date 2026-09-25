/**
 * Gacha HTTP surface.
 *
 * Relocated from `api/modules/gacha/gacha.controllers.ts` (itself split out of
 * `api/modules/game/game.controllers.ts` in P4.3b). Routes and response shapes are
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
 * Authorization is now the controller's job (`./gacha.authorization.js`, 401/403 before any
 * validation message) and the service's, for the part that needs the roster: a route that names
 * a `:studentId` checks the caller owns that row (student self, parent's linked child, teacher's
 * own class), and a route that names a `:classId` checks they belong to it. The draw routes take
 * the student from the actor rather than from the path, so an anonymous or third-party draw is
 * refused before a single point moves. `GET /api/gacha/dictionary` is the one route the matrix
 * leaves to "anyone or a logged-in user"; it now requires a login (P3's "at least require a
 * session" reading) and stays open to every role.
 */

import { Body, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { requireActor, requireActorRole } from './gacha.authorization.js';
import { GachaService } from './gacha.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/** Dictionary administration: the pet catalogue feeds every class's pool. */
const STAFF = ['teacher', 'admin', 'superadmin'];

/** A class's pool is read by its own teacher and students - not by parents. */
const CLASS_READERS = ['student', 'teacher', 'admin', 'superadmin'];

/** A student's own album, its linked parent, and the teachers of their class. */
const COLLECTION_READERS = ['student', 'parent', 'teacher', 'admin', 'superadmin'];

@Controller('api/gacha')
export class GachaController {
  constructor(@Inject(GachaService) private readonly gachaService: GachaService) {}

  @Get('dictionary')
  async dictionary(@Req() req: Request) {
    requireActor(req);
    const pets = await this.gachaService.listDictionary();
    return ok({ pets }, { pets });
  }

  @Post('dictionary')
  async createDictionary(@Req() req: Request, @Body() body: Record<string, any>) {
    requireActorRole(req, STAFF);
    return ok(await this.gachaService.createDictionary(body as any));
  }

  @Get('pools/:classId')
  async legacyPools(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    return { success: true, pools: await this.gachaService.listPools(actor, classId) };
  }

  @Post('draw/:studentId')
  async legacyDraw(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['student']);
    return { success: true, results: await this.gachaService.draw(actor, studentId, body as any) };
  }

  @Get('collection/:studentId')
  async legacyCollection(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, COLLECTION_READERS);
    return { success: true, collection: await this.gachaService.listCollection(actor, studentId) };
  }

  @Put('active/:studentId/:instanceId')
  async legacyActivePet(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Param('instanceId') instanceId: string,
  ) {
    const actor = requireActorRole(req, ['student']);
    await this.gachaService.setActivePet(actor, studentId, instanceId);
    return { success: true };
  }

  @Get('classes/:classId/pools')
  async pools(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    const pools = await this.gachaService.listPools(actor, classId);
    return ok({ pools }, { pools });
  }

  @Post('students/:studentId/draws')
  async draw(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['student']);
    const results = await this.gachaService.draw(actor, studentId, body as any);
    return ok({ results }, { results });
  }

  @Get('students/:studentId/collection')
  async collection(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, COLLECTION_READERS);
    const collection = await this.gachaService.listCollection(actor, studentId);
    return ok({ collection }, { collection });
  }

  @Put('students/:studentId/active-pet/:instanceId')
  async activePet(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Param('instanceId') instanceId: string,
  ) {
    const actor = requireActorRole(req, ['student']);
    return ok(await this.gachaService.setActivePet(actor, studentId, instanceId));
  }
}
