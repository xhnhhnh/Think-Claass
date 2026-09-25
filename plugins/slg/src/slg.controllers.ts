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
 * Authorization is enforced here now, and it is two layers on purpose: the role gate
 * (`requireActorRole`) answers 401 for an anonymous caller and 403 for a role that may not
 * call the route at all, before any validation message; the scope gate
 * (`SlgService.assertClassAccess` / `assertTeacherClass` / `assertSelfStudent`) answers 403
 * for a caller who is known but naming a class or a student that is not theirs. The URL's
 * `:studentId` / `:classId` are never identity: a contribution is only accepted from the
 * student row the actor's own login owns.
 */

import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { requireActorRole } from './slg.authorization.js';
import { SlgService } from './slg.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/** The class map is read by its teacher and by the students in it. */
const CLASS_READERS = ['teacher', 'student'];
/** Territory creation and yield settle a class's resources: its teacher, or staff admin. */
const CLASS_WRITERS = ['teacher', 'admin', 'superadmin'];

@Controller('api/slg')
export class SlgController {
  constructor(@Inject(SlgService) private readonly slgService: SlgService) {}

  @Get('map/:classId')
  async legacyMap(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    await this.slgService.assertClassAccess(actor, classId);
    return { success: true, ...(await this.slgService.getMap(classId)) };
  }

  @Post('student/:studentId/contribute/:territoryId')
  async legacyContribute(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Param('territoryId') territoryId: string,
    @Body() body: Record<string, any>,
  ) {
    const actor = requireActorRole(req, ['student']);
    await this.slgService.assertSelfStudent(actor, studentId);
    await this.slgService.contribute(studentId, territoryId, body as any);
    return { success: true };
  }

  @Post('teacher')
  async legacyCreateTerritory(@Req() req: Request, @Body() body: Record<string, any>) {
    // The legacy route discarded the created id; only the newer one returns it.
    const actor = requireActorRole(req, CLASS_WRITERS);
    await this.slgService.assertTeacherClass(actor, body?.class_id);
    await this.slgService.createTerritory(body as any);
    return { success: true };
  }

  @Post('teacher/yield/:classId')
  async legacyYield(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_WRITERS);
    await this.slgService.assertTeacherClass(actor, classId);
    await this.slgService.yieldResources(classId);
    return { success: true };
  }

  @Get('classes/:classId/map')
  async map(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    await this.slgService.assertClassAccess(actor, classId);
    const data = await this.slgService.getMap(classId);
    return ok(data, data);
  }

  @Post('students/:studentId/territories/:territoryId/contributions')
  async contribute(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Param('territoryId') territoryId: string,
    @Body() body: Record<string, any>,
  ) {
    const actor = requireActorRole(req, ['student']);
    await this.slgService.assertSelfStudent(actor, studentId);
    return ok(await this.slgService.contribute(studentId, territoryId, body as any));
  }

  @Post('classes/:classId/territories')
  async createTerritory(@Req() req: Request, @Param('classId') classId: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, CLASS_WRITERS);
    await this.slgService.assertTeacherClass(actor, classId);
    return ok(await this.slgService.createTerritory({ ...body, class_id: Number(classId) } as any));
  }

  @Post('classes/:classId/yield')
  async yieldResources(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_WRITERS);
    await this.slgService.assertTeacherClass(actor, classId);
    return ok(await this.slgService.yieldResources(classId));
  }
}
