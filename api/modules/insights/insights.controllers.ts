import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';

import { throwInsightsError } from './insights.errors.js';
import { InsightsService } from './insights.service.js';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(@Inject(InsightsService) private readonly insightsService: InsightsService) {}

  @Get('classes/:classId/overview')
  getClassOverview(@Req() req: Request, @Param('classId') classId: string) {
    try {
      return { success: true, ...this.insightsService.getClassOverview(req, classId) };
    } catch (error) {
      throwInsightsError(error);
    }
  }

  @Get('students/:studentId/report')
  getStudentReport(@Req() req: Request, @Param('studentId') studentId: string) {
    try {
      return { success: true, ...this.insightsService.getStudentReport(req, studentId) };
    } catch (error) {
      throwInsightsError(error);
    }
  }

  @Get('students/:studentId/radar')
  getStudentRadar(@Req() req: Request, @Param('studentId') studentId: string) {
    try {
      return { success: true, ...this.insightsService.getStudentRadar(req, studentId) };
    } catch (error) {
      throwInsightsError(error);
    }
  }
}
