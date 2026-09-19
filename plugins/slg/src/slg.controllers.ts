/**
 * SLG HTTP surface.
 *
 * Relocated from `api/modules/slg/slg.controllers.ts`. Routes and response shapes are
 * unchanged: the endpoint snapshot and the deployed frontend both depend on them.
 *
 * Two envelope styles coexist and both are deliberate:
 *
 *   - the four `/map/*`, `/student/*`, `/teacher*` legacy routes answer
 *     `{ success: true, ...payload }` (the map spreads its payload at the top level);
 *   - the newer `/classes/*`, `/students/*` routes answer through `ok()`, i.e.
 *     `{ success, data, ...legacyPayload }`, duplicating the payload at the top level
 *     for older clients.
 *
 * Collapsing either into the other is a breaking API change, not a cleanup.
 *
 * The pre-migration controller wrapped every call in `try { ... } catch (error) {
 * throwGameError(error) }`, which translated the legacy `api/utils/apiError.ts` into a
 * Nest `HttpException`. That translator is gone with the move: the service now throws
 * the kernel's `ApiError`, and both compositions install a global filter that renders it
 * (`api/app.ts` for legacy, the plugin host for the kernel composition), producing the
 * same `{ success: false, message }` body and status.
 *
 * Authorization is intentionally NOT added here. HANDOFF §10 records that only routes
 * calling `requireActorRole` are protected and most read the actor directly; changing
 * that is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation. Adding checks here would silently change the
 * contract this round is supposed to preserve.
 */

import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';

import { SlgService } from './slg.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/slg')
export class SlgController {
  constructor(@Inject(SlgService) private readonly slgService: SlgService) {}

  @Get('map/:classId')
  async legacyMap(@Param('classId') classId: string) {
    return { success: true, ...(await this.slgService.getMap(classId)) };
  }

  @Post('student/:studentId/contribute/:territoryId')
  async legacyContribute(
    @Param('studentId') studentId: string,
    @Param('territoryId') territoryId: string,
    @Body() body: Record<string, any>,
  ) {
    await this.slgService.contribute(studentId, territoryId, body as any);
    return { success: true };
  }

  @Post('teacher')
  async legacyCreateTerritory(@Body() body: Record<string, any>) {
    // The legacy route discarded the created id; only the newer one returns it.
    await this.slgService.createTerritory(body as any);
    return { success: true };
  }

  @Post('teacher/yield/:classId')
  async legacyYield(@Param('classId') classId: string) {
    await this.slgService.yieldResources(classId);
    return { success: true };
  }

  @Get('classes/:classId/map')
  async map(@Param('classId') classId: string) {
    const data = await this.slgService.getMap(classId);
    return ok(data, data);
  }

  @Post('students/:studentId/territories/:territoryId/contributions')
  async contribute(
    @Param('studentId') studentId: string,
    @Param('territoryId') territoryId: string,
    @Body() body: Record<string, any>,
  ) {
    return ok(await this.slgService.contribute(studentId, territoryId, body as any));
  }

  @Post('classes/:classId/territories')
  async createTerritory(@Param('classId') classId: string, @Body() body: Record<string, any>) {
    return ok(await this.slgService.createTerritory({ ...body, class_id: Number(classId) } as any));
  }

  @Post('classes/:classId/yield')
  async yieldResources(@Param('classId') classId: string) {
    return ok(await this.slgService.yieldResources(classId));
  }
}
