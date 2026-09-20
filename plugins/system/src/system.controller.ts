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
 *
 * That last fact is why all eight routes now gate on `requireAdmin` (see
 * system.authorization.ts): this surface was reachable anonymously, and
 * `GET /api/system/backup/export` answers with the whole database - `users.password_hash`
 * included. The gate runs before any work, and in `exportBackup` before a single byte of the
 * download is written.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { requireAdmin } from './system.authorization.js';
import { SystemService } from './system.service.js';
import type { QuestionInput } from './system.types.js';

@Controller('api/system')
export class SystemController {
  constructor(@Inject(SystemService) private readonly systemService: SystemService) {}

  @Get('questions')
  getQuestions(@Req() req: Request, @Query('teacherId') teacherId?: string) {
    requireAdmin(req);
    return { success: true, questions: this.systemService.getQuestions(teacherId) };
  }

  @Post('questions')
  createQuestion(@Req() req: Request, @Body() body: QuestionInput) {
    requireAdmin(req);
    return { success: true, question: this.systemService.createQuestion(body) };
  }

  @Put('questions/:id')
  updateQuestion(@Req() req: Request, @Param('id') id: string, @Body() body: QuestionInput) {
    requireAdmin(req);
    this.systemService.updateQuestion(id, body);
    return { success: true };
  }

  @Delete('questions/:id')
  deleteQuestion(@Req() req: Request, @Param('id') id: string) {
    requireAdmin(req);
    this.systemService.deleteQuestion(id);
    return { success: true };
  }

  @Get('settings')
  getSettings(@Req() req: Request) {
    requireAdmin(req);
    return { success: true, settings: this.systemService.getSettings() };
  }

  @Post('settings')
  upsertSetting(@Req() req: Request, @Body() body: { key?: string; value?: string; description?: string }) {
    requireAdmin(req);
    this.systemService.upsertSetting(body);
    return { success: true };
  }

  @Get('logs')
  getLogs(@Req() req: Request) {
    requireAdmin(req);
    return { success: true, logs: this.systemService.getLogs() };
  }

  /**
   * `@Res()` is kept because the response is a file download, not JSON: Nest would
   * serialize the returned string *as* a JSON string (quoted, escaped), which is exactly
   * the bug this avoids. `res.send()` writes it verbatim.
   *
   * The admin gate is the first statement: it throws before either header is set, so a
   * refused download is a normal `{success:false,message}` envelope rather than a
   * half-written attachment of the real database.
   */
  @Get('backup/export')
  exportBackup(@Req() req: Request, @Res() res: Response) {
    requireAdmin(req);

    const json = this.systemService.exportBackup();

    res.setHeader('Content-disposition', 'attachment; filename=backup.json');
    res.setHeader('Content-type', 'application/json');
    return res.send(json);
  }
}
