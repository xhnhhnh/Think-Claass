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
 *
 * Authorization: the audit's static pass already saw an actor lookup here (the handlers call
 * `actorOf(req)`), but two of the three routes answered an anonymous caller anyway - only the
 * student-scoped access check refused, and the class overview refused only a *teacher* who did not
 * own the class, so an unnamed caller could read any class's report. The controller now resolves the
 * caller with `requireActor` (401 `未登录或登录已过期` before any port call), and the service applies
 * the matrix's per-route scope: `admin 任意；teacher 本班；parent 孩子；student 本人`.
 */

import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

import { InsightsService } from './insights.service.js';
import type { ReportActor } from './insights.types.js';

/** The caller, with the same precedence the legacy `getRequestActor` had. */
function actorOf(req: Request): ReportActor {
  const actor = getRequestContext(req).actor;
  return actor
    ? { id: actor.userId, role: actor.role, studentId: actor.studentId, classId: actor.classId }
    : { id: null, role: null };
}

/** The caller, or 401 when the request carries no verified actor. */
function requireActor(req: Request): ReportActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  return actor;
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
    const actor = requireActor(req);
    try {
      return { success: true, ...(await this.insightsService.getClassOverview(actor, classId)) };
    } catch (error) {
      throwInsightsError(error);
    }
  }

  @Get('students/:studentId/report')
  async getStudentReport(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActor(req);
    try {
      return { success: true, ...(await this.insightsService.getStudentReport(actor, studentId)) };
    } catch (error) {
      throwInsightsError(error);
    }
  }

  @Get('students/:studentId/radar')
  async getStudentRadar(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActor(req);
    try {
      return { success: true, ...(await this.insightsService.getStudentRadar(actor, studentId)) };
    } catch (error) {
      throwInsightsError(error);
    }
  }
}
