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
 */

import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';

import { ParentBuffService } from './parentBuff.service.js';

@Controller('api/parent-buff')
export class ParentBuffController {
  constructor(@Inject(ParentBuffService) private readonly service: ParentBuffService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  createParentBuff(@Body() body: { studentId?: number }) {
    this.service.createParentBuff(body);
    return { success: true };
  }
}
