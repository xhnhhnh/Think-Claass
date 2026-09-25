/**
 * The admin console's HTTP surface: 18 routes under `/api/admin`, 7 under `/api/openapi`, and 1
 * under `/api/audit-logs`, ported verbatim from `api/modules/admin/admin.controllers.ts`.
 *
 * The METHOD+PATH pairs and the response envelopes are unchanged - that is what keeps
 * `npm run api:surface -- --check` at the recorded count, now 321 - and so are three details
 * that are easy to lose in a port:
 *
 *   1. **Every POST carries `@HttpCode(200)`.** Nest answers 201 for POST by default; the console's
 *      frontend checks `success`, but the statuses are part of the surface and `plugins/learning`
 *      records the same trap from the other direction.
 *   2. **`ok(data, message)` sometimes and `ok(data)` otherwise.** The message is part of the body
 *      the console renders as a toast.
 *   3. **The error translation keeps Nest exceptions untouched** (see admin.errors.ts): the
 *      database import route goes through `FileInterceptor`, whose own exceptions already have the
 *      right status.
 *
 * The AI round added exactly one route - `POST /api/admin/system/ai/test`, the 18th under
 * `/api/admin` - which is why the count above is 18 rather than the 17 this file was ported with.
 * It follows all three rules (`@HttpCode(200)`, a message, `requireAdmin` first) and holds no
 * provider knowledge: the model lives in the optional `homework` plugin behind the
 * `homework.public` port.
 *
 * Authorization is unchanged in position: `requireAdmin` guards every `/api/admin` route, the
 * update routes additionally require `superadmin`, and so do the OpenAPI and audit-log routes -
 * the console is the only caller of all three, and it sends the session token its own login
 * (`POST /api/admin/session`) mints. Those two controllers used to be reachable anonymously:
 * `/api/openapi/keys` answered with plaintext `sk_...` keys and the audit log with operator ids
 * and IPs, so the gate is a fix, not a behaviour change the UI can observe.
 */

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

import { ApiError } from '@thinkclass/kernel';

import { throwAdminError } from './admin.errors.js';
import { AdminService } from './admin.service.js';
import { errorMessage, ok, requireAdmin } from './admin.support.js';
import { AuditLogsService } from './auditLogs.service.js';
import { OpenApiService } from './openapi.service.js';

@Controller('api/admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  /**
   * Admin console login. Also issues a session token, mirroring `/api/auth/login`, so the console
   * stops relying on client-asserted role headers.
   */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  async createSession(@Body() body: Record<string, any>, @Req() req: Request) {
    try {
      const { username = '', password = '' } = body ?? {};
      const result = await this.adminService.createSession(String(username), String(password));

      const user = (result as { user?: { id?: number; role?: string } }).user;
      if (!user?.id || !user.role) return ok(result);

      const session = this.adminService.issueSession(
        { id: user.id, role: user.role },
        { userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null },
      );

      return ok({ ...result, token: session.token, expiresAt: session.expiresAt });
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

  /**
   * 测试连接 for the `ai_*` settings.
   *
   * A POST because it performs one outbound model call - it is not idempotent in the HTTP sense and
   * must not be prefetched or cached. The provider itself lives in the optional `homework` plugin and
   * is reached through the `homework.public` port, so this handler contains no provider knowledge:
   * a deployment without that plugin gets a normal 200 saying so (see `AdminService.testAiConnection`),
   * not a 404 or a 500 on a settings screen.
   */
  @Post('system/ai/test')
  @HttpCode(HttpStatus.OK)
  async testAiConnection(@Req() req: Request) {
    try {
      requireAdmin(req);
      const result = await this.adminService.testAiConnection();
      return ok(result, result.message);
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
      const actor = requireAdmin(req);
      return ok(await this.adminService.createTeacher((body ?? {}) as any, actor, req.ip), '教师创建成功');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Put('users/:id')
  async updateUser(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      const actor = requireAdmin(req);
      return ok(
        await this.adminService.updateTeacher(Number(id), (body ?? {}) as any, actor, req.ip),
        '教师更新成功',
      );
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Delete('users/:id')
  async deleteUser(@Req() req: Request, @Param('id') id: string) {
    try {
      const actor = requireAdmin(req);
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
      const actor = requireAdmin(req);
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
      const actor = requireAdmin(req);
      return ok(await this.adminService.createAnnouncement((body ?? {}) as any, actor, req.ip), '公告创建成功');
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Put('announcements/:id')
  async updateAnnouncement(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      const actor = requireAdmin(req);
      return ok(
        await this.adminService.updateAnnouncement(Number(id), (body ?? {}) as any, actor, req.ip),
        '公告更新成功',
      );
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Req() req: Request, @Param('id') id: string) {
    try {
      const actor = requireAdmin(req);
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
  listKeys(@Req() req: Request) {
    try {
      requireAdmin(req);
      return { success: true, keys: this.openApiService.listKeys() };
    } catch (error) {
      console.error('Fetch API keys error:', error);
      throwAdminError(error, '获取API Keys失败');
    }
  }

  @Post('keys')
  @HttpCode(HttpStatus.OK)
  createKey(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      return { success: true, key: this.openApiService.createKey(body) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Create API key error:', error);
      throwAdminError(error, '创建API Key失败');
    }
  }

  @Delete('keys/:id')
  deleteKey(@Req() req: Request, @Param('id') id: string) {
    try {
      requireAdmin(req);
      this.openApiService.deleteKey(id);
      return { success: true };
    } catch (error) {
      console.error('Delete API key error:', error);
      throwAdminError(error, '删除API Key失败');
    }
  }

  @Get('schools')
  listSchools(@Req() req: Request) {
    try {
      requireAdmin(req);
      return { success: true, schools: this.openApiService.listSchools() };
    } catch (error) {
      console.error('Fetch schools error:', error);
      throwAdminError(error, '获取校园列表失败');
    }
  }

  @Post('schools')
  @HttpCode(HttpStatus.OK)
  createSchool(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      return { success: true, school: this.openApiService.createSchool(body) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Create school error:', error);
      throwAdminError(error, '创建校园失败');
    }
  }

  @Put('schools/:id')
  updateSchool(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      requireAdmin(req);
      return { success: true, school: this.openApiService.updateSchool(id, body) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Update school error:', error);
      throwAdminError(error, '更新校园失败');
    }
  }

  @Delete('schools/:id')
  deleteSchool(@Req() req: Request, @Param('id') id: string) {
    try {
      requireAdmin(req);
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
  listLogs(@Req() req: Request, @Query() query: Record<string, any>) {
    try {
      requireAdmin(req);
      return { success: true, ...this.auditLogsService.listLogs(query) };
    } catch (error) {
      throwAdminError(error, errorMessage);
    }
  }
}
