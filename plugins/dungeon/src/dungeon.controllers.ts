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
 * Authorization is enforced here now. The matrix rules every route
 * `student（本人）/teacher（本班，只读）`, so:
 *
 *   - the role gate answers 401 for an anonymous caller and 403 for a role that may not call the
 *     route at all - a teacher may read a run but never start, advance or abandon one;
 *   - `DungeonService.assertSelfStudent` / `assertStudentReadable` answer 403 for a caller who is
 *     known but naming a student that is not theirs, resolved from the actor through
 *     `classroom.public` - the URL's `:studentId` is never identity.
 */

import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { requireActorRole } from './dungeon.authorization.js';
import { DungeonService } from './dungeon.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/** Reading a run: the student's own row, or the teacher of that student's class. */
const READERS = ['student', 'teacher'];
/** Acting on a run - start, choose, abandon - is the student's own row only. */
const ACTORS = ['student'];

@Controller('api/dungeon')
export class DungeonController {
  constructor(@Inject(DungeonService) private readonly dungeonService: DungeonService) {}

  @Get('students/:studentId/run')
  async run(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, READERS);
    await this.dungeonService.assertStudentReadable(actor, studentId);
    const data = await this.dungeonService.getRun(studentId);
    return ok(data, data);
  }

  @Post('students/:studentId/start')
  async start(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ACTORS);
    await this.dungeonService.assertSelfStudent(actor, studentId);
    const data = await this.dungeonService.startRun(studentId);
    return ok(data, data);
  }

  @Post('students/:studentId/choices')
  async choose(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    const actor = requireActorRole(req, ACTORS);
    await this.dungeonService.assertSelfStudent(actor, studentId);
    const data = await this.dungeonService.choose(studentId, body as never);
    return ok(data, data);
  }

  @Post('students/:studentId/abandon')
  async abandon(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ACTORS);
    await this.dungeonService.assertSelfStudent(actor, studentId);
    return ok(await this.dungeonService.abandon(studentId));
  }

  @Get(':studentId')
  async legacyRun(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, READERS);
    await this.dungeonService.assertStudentReadable(actor, studentId);
    const data = await this.dungeonService.getRun(studentId);
    return { success: true, ...data };
  }

  @Post('start/:studentId')
  async legacyStart(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ACTORS);
    await this.dungeonService.assertSelfStudent(actor, studentId);
    const data = await this.dungeonService.startRun(studentId);
    return { success: true, ...data };
  }

  @Post('choice/:studentId')
  async legacyChoice(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const actor = requireActorRole(req, ACTORS);
    await this.dungeonService.assertSelfStudent(actor, studentId);
    const data = await this.dungeonService.choose(studentId, body as never);
    return { success: true, ...data };
  }

  @Post('abandon/:studentId')
  async legacyAbandon(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ACTORS);
    await this.dungeonService.assertSelfStudent(actor, studentId);
    await this.dungeonService.abandon(studentId);
    return { success: true };
  }
}
