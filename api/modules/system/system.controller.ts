import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SystemService } from './system.service.js';

@Controller('api/system')
export class SystemController {
  constructor(@Inject(SystemService) private readonly systemService: SystemService) {}

  @Get('questions')
  getQuestions(@Query('teacherId') teacherId?: string) {
    return this.runLegacy(() => ({
      success: true,
      questions: this.systemService.getQuestions(teacherId),
    }));
  }

  @Post('questions')
  createQuestion(@Body() body: Record<string, unknown>) {
    return this.runLegacy(() => ({
      success: true,
      question: this.systemService.createQuestion(body),
    }));
  }

  @Put('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.runLegacy(() => {
      this.systemService.updateQuestion(id, body);
      return { success: true };
    });
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.runLegacy(() => {
      this.systemService.deleteQuestion(id);
      return { success: true };
    });
  }

  @Get('settings')
  getSettings() {
    return this.runLegacy(() => ({
      success: true,
      settings: this.systemService.getSettings(),
    }));
  }

  @Post('settings')
  upsertSetting(@Body() body: Record<string, unknown>) {
    return this.runLegacy(() => {
      this.systemService.upsertSetting(body);
      return { success: true };
    });
  }

  @Get('logs')
  getLogs() {
    return this.runLegacy(() => ({
      success: true,
      logs: this.systemService.getLogs(),
    }));
  }

  @Get('backup/export')
  exportBackup(@Res() res: Response) {
    const json = this.runLegacy(() => this.systemService.exportBackup());

    res.setHeader('Content-disposition', 'attachment; filename=backup.json');
    res.setHeader('Content-type', 'application/json');
    return res.send(json);
  }

  private runLegacy<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      console.error('[SystemController] Legacy-compatible handler failed:', error);
      throw new HttpException(
        { success: false, message: 'Server error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
