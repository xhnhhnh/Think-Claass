/**
 * Dungeon HTTP surface.
 *
 * Relocated from `api/modules/dungeon/dungeon.controllers.ts`. Routes and response
 * shapes are unchanged: the endpoint snapshot and the deployed frontend both depend
 * on them. Two envelope styles coexist and both are deliberate:
 *
 *   - the four `/students/:studentId/*` routes answer through `ok()` with the payload
 *     duplicated at the top level (`ok(data, data)`), except `abandon`, which the
 *     original also returned without that duplication;
 *   - the four legacy aliases spread the payload next to `success` (`{ success, ...data }`).
 *
 * Collapsing either into the other is a breaking API change, not a cleanup.
 *
 * Errors: the pre-migration controller wrapped every call in
 * `try { ... } catch (error) { throwGameError(error) }`, which rendered an
 * `api/utils/apiError.ts` into `{ success: false, message }` with its status. The
 * plugin throws the kernel's `ApiError`, and both compositions install a global
 * filter (`renderError`) that duck-types `status`/`statusCode` and renders exactly
 * the same envelope. So the try/catch is gone without the observable body moving.
 *
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation. Adding checks here would silently change the
 * contract this round is supposed to preserve.
 */

import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';

import { DungeonService } from './dungeon.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/dungeon')
export class DungeonController {
  constructor(@Inject(DungeonService) private readonly dungeonService: DungeonService) {}

  @Get('students/:studentId/run')
  async run(@Param('studentId') studentId: string) {
    const data = await this.dungeonService.getRun(studentId);
    return ok(data, data);
  }

  @Post('students/:studentId/start')
  async start(@Param('studentId') studentId: string) {
    const data = await this.dungeonService.startRun(studentId);
    return ok(data, data);
  }

  @Post('students/:studentId/choices')
  async choose(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const data = await this.dungeonService.choose(studentId, body as never);
    return ok(data, data);
  }

  @Post('students/:studentId/abandon')
  async abandon(@Param('studentId') studentId: string) {
    return ok(await this.dungeonService.abandon(studentId));
  }

  @Get(':studentId')
  async legacyRun(@Param('studentId') studentId: string) {
    const data = await this.dungeonService.getRun(studentId);
    return { success: true, ...data };
  }

  @Post('start/:studentId')
  async legacyStart(@Param('studentId') studentId: string) {
    const data = await this.dungeonService.startRun(studentId);
    return { success: true, ...data };
  }

  @Post('choice/:studentId')
  async legacyChoice(@Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const data = await this.dungeonService.choose(studentId, body as never);
    return { success: true, ...data };
  }

  @Post('abandon/:studentId')
  async legacyAbandon(@Param('studentId') studentId: string) {
    await this.dungeonService.abandon(studentId);
    return { success: true };
  }
}
