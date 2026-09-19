/**
 * The three `api/analytics` routes, relocated from
 * `api/modules/insights/insights.controllers.ts`.
 *
 * METHOD+PATH unchanged, envelope unchanged (`{ success: true, ...serviceResult }`), and the error
 * translation is the legacy `throwInsightsError`: an `ApiError` becomes an `HttpException` carrying
 * `{success:false, message}` with its status, anything else becomes a 500. The kernel's global filter
 * renders a kernel `ApiError` into exactly that body, so the helper now just rethrows.
 *
 * The actor comes from `getRequestContext` rather than `api/utils/requestAuth.ts`: the context
 * middleware runs in both compositions and is the only identity source a plugin may use.
 */

import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

import { InsightsService } from './insights.service.js';
import type { ReportActor } from './insights.types.js';

/** The caller, with the same precedence the legacy `getRequestActor` had. */
function actorOf(req: Request): ReportActor {
  const actor = getRequestContext(req).actor;
  return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
}

/** The legacy `throwInsightsError`. */
function throwInsightsError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  throw new ApiError(500, 'Internal Server Error');
}

@Controller('api/analytics')
export class AnalyticsController {
  constructor(@Inject(InsightsService) private readonly insightsService: InsightsService) {}

  @Get('classes/:classId/overview')
  async getClassOverview(@Req() req: Request, @Param('classId') classId: string) {
    try {
      return { success: true, ...(await this.insightsService.getClassOverview(actorOf(req), classId)) };
    } catch (error) {
      throwInsightsError(error);
    }
  }

  @Get('students/:studentId/report')
  async getStudentReport(@Req() req: Request, @Param('studentId') studentId: string) {
    try {
      return { success: true, ...(await this.insightsService.getStudentReport(actorOf(req), studentId)) };
    } catch (error) {
      throwInsightsError(error);
    }
  }

  @Get('students/:studentId/radar')
  async getStudentRadar(@Req() req: Request, @Param('studentId') studentId: string) {
    try {
      return { success: true, ...(await this.insightsService.getStudentRadar(actorOf(req), studentId)) };
    } catch (error) {
      throwInsightsError(error);
    }
  }
}
