import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import os from 'os';

import type { ApiSuccessResponse } from '../../../src/shared/admin/contracts.js';
import { ApiError } from '../../utils/apiError.js';
import { getRequestActor, requireActorRole } from '../../utils/requestAuth.js';
import { AdminService } from './admin.service.js';
import { throwAdminError } from './admin.errors.js';
import { OpenApiService } from './openapi.service.js';
import { AuditLogsService } from './auditLogs.service.js';

function ok<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return message ? { success: true, data, message } : { success: true, data };
}

function requireAdmin(req: Request) {
  requireActorRole(req, ['admin', 'superadmin']);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Internal Server Error');

@Controller('api/admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  async createSession(@Body() body: Record<string, any>) {
    try {
      const { username = '', password = '' } = body ?? {};
      return ok(await this.adminService.createSession(String(username), String(password)));
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('system/stats')
  async getSystemStats(@Req() req: Request) {
    try {
      requireAdmin(req);
      return ok(await this.adminService.getSystemStats());
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('system/settings')
  async getSystemSettings(@Req() req: Request) {
    try {
      requireAdmin(req);
      return ok(await this.adminService.getSystemSettings());
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Put('system/settings')
  async updateSystemSettings(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      return ok(await this.adminService.updateSystemSettings(body ?? {}), '系统设置已更新');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('system/database/export')
  async exportDatabase(@Req() req: Request, @Res() res: Response) {
    try {
      requireAdmin(req);
      const exportPayload = await this.adminService.exportDatabase();
      return res.download(exportPayload.filePath, exportPayload.fileName);
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Post('system/database/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir() }))
  async importDatabase(@Req() req: Request, @UploadedFile() file: Express.Multer.File | undefined) {
    try {
      requireAdmin(req);
      if (!file) throw new ApiError(400, '未提供文件');
      const result = await this.adminService.importDatabase(file.path);
      return ok(result, result.message);
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Post('system/database/reset')
  @HttpCode(HttpStatus.OK)
  async resetDatabase(@Req() req: Request) {
    try {
      requireAdmin(req);
      const result = await this.adminService.resetDatabase();
      return ok(result, result.message);
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('users')
  async listUsers(@Req() req: Request) {
    try {
      requireAdmin(req);
      const teachers = await this.adminService.listTeachers();
      return ok({ items: teachers, total: teachers.length });
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Post('users')
  @HttpCode(HttpStatus.OK)
  async createUser(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      return ok(await this.adminService.createTeacher((body ?? {}) as any, actor, req.ip), '教师创建成功');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Put('users/:id')
  async updateUser(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      return ok(await this.adminService.updateTeacher(Number(id), (body ?? {}) as any, actor, req.ip), '教师更新成功');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Delete('users/:id')
  async deleteUser(@Req() req: Request, @Param('id') id: string) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      const result = await this.adminService.deleteTeacher(Number(id), actor, req.ip);
      return ok(result, result.message);
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('codes')
  async listCodes(@Req() req: Request) {
    try {
      requireAdmin(req);
      const codes = await this.adminService.listActivationCodes();
      return ok({ items: codes, total: codes.length });
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Post('codes')
  @HttpCode(HttpStatus.OK)
  async createCodes(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      const result = await this.adminService.generateActivationCodes((body ?? {}) as any, actor, req.ip);
      return ok(result, result.message);
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('announcements')
  async listAnnouncements(@Req() req: Request) {
    try {
      requireAdmin(req);
      const announcements = await this.adminService.listAnnouncements();
      return ok({ items: announcements, total: announcements.length });
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Post('announcements')
  @HttpCode(HttpStatus.OK)
  async createAnnouncement(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      return ok(await this.adminService.createAnnouncement((body ?? {}) as any, actor, req.ip), '公告创建成功');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Put('announcements/:id')
  async updateAnnouncement(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      return ok(await this.adminService.updateAnnouncement(Number(id), (body ?? {}) as any, actor, req.ip), '公告更新成功');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Req() req: Request, @Param('id') id: string) {
    try {
      requireAdmin(req);
      const actor = getRequestActor(req);
      const result = await this.adminService.deleteAnnouncement(Number(id), actor, req.ip);
      return ok(result, result.message);
    } catch (error) {
      throwAdminError(error);
    }
  }
}

@Controller('api/openapi')
export class OpenApiController {
  constructor(@Inject(OpenApiService) private readonly openApiService: OpenApiService) {}

  @Get('keys')
  listKeys() {
    try {
      return { success: true, keys: this.openApiService.listKeys() };
    } catch (error) {
      console.error('Fetch API keys error:', error);
      throwAdminError(error, '获取API Keys失败');
    }
  }

  @Post('keys')
  @HttpCode(HttpStatus.OK)
  createKey(@Body() body: Record<string, any>) {
    try {
      return { success: true, key: this.openApiService.createKey(body) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Create API key error:', error);
      throwAdminError(error, '创建API Key失败');
    }
  }

  @Delete('keys/:id')
  deleteKey(@Param('id') id: string) {
    try {
      this.openApiService.deleteKey(id);
      return { success: true };
    } catch (error) {
      console.error('Delete API key error:', error);
      throwAdminError(error, '删除API Key失败');
    }
  }

  @Get('schools')
  listSchools() {
    try {
      return { success: true, schools: this.openApiService.listSchools() };
    } catch (error) {
      console.error('Fetch schools error:', error);
      throwAdminError(error, '获取校园列表失败');
    }
  }

  @Post('schools')
  @HttpCode(HttpStatus.OK)
  createSchool(@Body() body: Record<string, any>) {
    try {
      return { success: true, school: this.openApiService.createSchool(body) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Create school error:', error);
      throwAdminError(error, '创建校园失败');
    }
  }

  @Put('schools/:id')
  updateSchool(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, school: this.openApiService.updateSchool(id, body) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Update school error:', error);
      throwAdminError(error, '更新校园失败');
    }
  }

  @Delete('schools/:id')
  deleteSchool(@Param('id') id: string) {
    try {
      this.openApiService.deleteSchool(id);
      return { success: true };
    } catch (error) {
      console.error('Delete school error:', error);
      throwAdminError(error, '删除校园失败');
    }
  }
}

@Controller('api/audit-logs')
export class AuditLogsController {
  constructor(@Inject(AuditLogsService) private readonly auditLogsService: AuditLogsService) {}

  @Get()
  listLogs(@Query() query: Record<string, any>) {
    try {
      return { success: true, ...this.auditLogsService.listLogs(query) };
    } catch (error) {
      throwAdminError(error, errorMessage);
    }
  }
}
