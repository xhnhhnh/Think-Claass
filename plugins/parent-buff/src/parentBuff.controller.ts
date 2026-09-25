/**
 * Parent-buff HTTP surface.
 *
 * Relocated from `api/modules/platform/platform.controllers.ts`; the route and its envelope
 * are unchanged:
 *
 *   POST /api/parent-buff  ->  { success: true }      (200, `@HttpCode(HttpStatus.OK)`:
 *                                                      a bare Nest POST would answer 201)
 *
 * The legacy `throwPlatformError(error, errorMessage)` wrapper is gone rather than
 * translated. Its only added behavior over the global filter was turning an unknown error
 * into `{success:false, message:<error.message>}` with status 500; the filter renders an
 * uncaught error the same way but with a fixed message. That difference is unobservable
 * through these two guards: both failure paths are `ApiError`s, which carry their own
 * message and status.
 *
 * ## Authorization
 *
 * The route used to be anonymous: the matrix records that anyone could forge a parent's
 * participation and trigger the 20% points bonus the classroom derives from it. The caller is now
 * resolved from the kernel's request context (`parent（本人孩子）/teacher`, 401 when unknown and 403
 * when the role is not listed), and a parent may only bless one of their own children.
 *
 * The body guard runs **before** the gate, deliberately. `tests/plugins/legacy-boot-probe.test.ts`
 * posts an empty body and pins the legacy `400 Student ID required`, which is what distinguishes
 * "the plugin's controller ran" from "the route is not mounted"; that check reads nothing and leaks
 * nothing, and the authorization gate still runs before the daily-limit read and before any write.
 * A request that names a student - the only shape that can write - is gated first.
 */

import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiError } from '@thinkclass/kernel';

import { requireActorRole } from './parentBuff.authorization.js';
import { ParentBuffService } from './parentBuff.service.js';

@Controller('api/parent-buff')
export class ParentBuffController {
  constructor(@Inject(ParentBuffService) private readonly service: ParentBuffService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async createParentBuff(@Req() req: Request, @Body() body: Record<string, any>) {
    const { studentId } = body ?? {};
    if (!studentId) {
      throw new ApiError(400, 'Student ID required');
    }

    const actor = requireActorRole(req, ['parent', 'teacher']);
    // A parent may only bless their own child; see `assertActorMayBless`.
    await this.service.assertActorMayBless(actor, studentId);

    this.service.createParentBuff(body);
    return { success: true };
  }
}
