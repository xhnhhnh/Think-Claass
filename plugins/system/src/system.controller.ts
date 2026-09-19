/**
 * System HTTP surface.
 *
 * Relocated from `api/modules/system/system.controller.ts`; the eight `api/system`
 * routes and their envelope shapes are unchanged. Note that these are **not** the
 * `{ success, data }` shape the rest of the API uses:
 *
 *   GET    /api/system/questions      { success: true, questions: [...] }
 *   POST   /api/system/questions      { success: true, question: {...} }
 *   PUT    /api/system/questions/:id  { success: true }
 *   DELETE /api/system/questions/:id  { success: true }
 *   GET    /api/system/settings       { success: true, settings: [...] }
 *   POST   /api/system/settings       { success: true }
 *   GET    /api/system/logs           { success: true, logs: [...] }
 *   GET    /api/system/backup/export  raw JSON with a Content-disposition attachment
 *
 * The legacy `runLegacy()` wrapper is gone, not translated. It caught every error and
 * rethrew `HttpException({success:false,message:'Server error'}, 500)` - which is what
 * the composition's global filter already renders for an uncaught error, only with a
 * real message instead of a constant. Nothing consumed the constant body: it was
 * invented here, and the frontend never calls these routes.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { SystemService } from './system.service.js';
import type { QuestionInput } from './system.types.js';

@Controller('api/system')
export class SystemController {
  constructor(@Inject(SystemService) private readonly systemService: SystemService) {}

  @Get('questions')
  getQuestions(@Query('teacherId') teacherId?: string) {
    return { success: true, questions: this.systemService.getQuestions(teacherId) };
  }

  @Post('questions')
  createQuestion(@Body() body: QuestionInput) {
    return { success: true, question: this.systemService.createQuestion(body) };
  }

  @Put('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() body: QuestionInput) {
    this.systemService.updateQuestion(id, body);
    return { success: true };
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    this.systemService.deleteQuestion(id);
    return { success: true };
  }

  @Get('settings')
  getSettings() {
    return { success: true, settings: this.systemService.getSettings() };
  }

  @Post('settings')
  upsertSetting(@Body() body: { key?: string; value?: string; description?: string }) {
    this.systemService.upsertSetting(body);
    return { success: true };
  }

  @Get('logs')
  getLogs() {
    return { success: true, logs: this.systemService.getLogs() };
  }

  /**
   * `@Res()` is kept because the response is a file download, not JSON: Nest would
   * serialize the returned string *as* a JSON string (quoted, escaped), which is exactly
   * the bug this avoids. `res.send()` writes it verbatim.
   */
  @Get('backup/export')
  exportBackup(@Res() res: Response) {
    const json = this.systemService.exportBackup();

    res.setHeader('Content-disposition', 'attachment; filename=backup.json');
    res.setHeader('Content-type', 'application/json');
    return res.send(json);
  }
}
