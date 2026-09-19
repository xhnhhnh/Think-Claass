/**
 * The seventeen engagement routes, relocated from
 * `api/modules/engagement/engagement.controllers.ts`.
 *
 * METHOD+PATH unchanged; the seven controller prefixes are kept (announcements, class-announcements,
 * praises, certificates, redemption, messages, family-tasks, lucky-draw, danmaku - nine, counting
 * the two that share a prefix family), so the endpoint surface does not move.
 *
 * Error translation is the legacy module's own, kept per controller because it was not uniform:
 * `legacyError(status, message)` built an `HttpException` with `{success:false, message}`, and each
 * handler chose its own fallback text ('获取公告失败', 'Internal Server Error', 'Server error', or the
 * error's own message). The kernel's global filter renders a kernel `ApiError` into exactly the same
 * body, so this helper now only builds that `ApiError`.
 *
 * Two handlers answer through `@Res()` and therefore bypass the filter - `POST /api/redemption/verify`
 * and `POST /api/lucky-draw/draw` - because the service returns a `{status, body}` pair. They keep
 * writing the response themselves, exactly as before.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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

import { ApiError } from '@thinkclass/kernel';

import { EngagementService } from './engagement.service.js';

/**
 * The legacy `legacyError(status, message)`.
 *
 * Returns a Nest `HttpException`, **not** the kernel's `ApiError`, and the difference is observable.
 * The legacy handlers rethrow `HttpException` and swallow everything else into a 500, so the
 * controller's own sentinels (the 400s for bad input, the 404s for a missing task) survived while
 * the application's `ApiError` - which the class-feature gate and `getStudentById` threw - did not.
 *
 * Using the kernel's `ApiError` here instead looked tidier and silently changed three statuses:
 * `GET /api/family-tasks` with no query answered 500 instead of the legacy 400, and the same
 * mistake turned the gate's documented 500s into 403/404. The probe caught it; see the comment on
 * `FamilyTasksController`.
 */
function legacyError(status: number, message: string): HttpException {
  return new HttpException({ success: false, message }, status);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Server error';
}

@Controller('api/announcements')
export class AnnouncementsController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get('active')
  getActiveAnnouncement() {
    try {
      return { success: true, announcement: this.engagementService.getActiveAnnouncement() };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, '获取公告失败');
    }
  }
}

@Controller('api/class-announcements')
export class ClassAnnouncementsController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  getClassAnnouncements(@Query('classId') classId?: string) {
    if (!classId) throw legacyError(HttpStatus.BAD_REQUEST, 'classId is required');

    try {
      return { success: true, announcements: this.engagementService.getClassAnnouncements(classId) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createClassAnnouncement(@Body() body: Record<string, any>) {
    const { class_id, teacher_id, title, content } = body;
    if (!class_id || !teacher_id || !title || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    try {
      return { success: true, announcement: this.engagementService.createClassAnnouncement(body) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete(':id')
  deleteClassAnnouncement(@Param('id') id: string) {
    try {
      this.engagementService.deleteClassAnnouncement(id);
      return { success: true, message: 'Announcement deleted successfully' };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/praises')
export class PraisesController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getPraises(@Query('classId') classId?: string) {
    if (!classId) throw legacyError(HttpStatus.BAD_REQUEST, 'classId is required');

    try {
      return { success: true, praises: await this.engagementService.getPraisesByClass(classId) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Get('student/:id')
  async getStudentPraises(@Param('id') id: string) {
    try {
      return { success: true, praises: await this.engagementService.getPraisesByStudent(id) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createPraise(@Body() body: Record<string, any>) {
    const { teacher_id, student_id, content } = body;
    if (!teacher_id || !student_id || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'teacher_id, student_id, and content are required');
    }

    try {
      return { success: true, praise: await this.engagementService.createPraise(body) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Delete(':id')
  deletePraise(@Param('id') id: string) {
    try {
      this.engagementService.deletePraise(id);
      return { success: true, message: 'Praise deleted successfully' };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }
}

@Controller('api/certificates')
export class CertificatesController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getCertificates(@Query('studentId') studentId?: string) {
    try {
      return { success: true, certificates: await this.engagementService.getCertificates(studentId) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createCertificate(@Body() body: Record<string, any>) {
    const { student_id, title } = body;
    if (!student_id || !title) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'student_id and title are required');
    }

    try {
      return { success: true, certificate: this.engagementService.createCertificate(body) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/redemption')
export class RedemptionController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get('my')
  getMyTickets(@Query('studentId') studentId?: string) {
    try {
      return { success: true, tickets: this.engagementService.getRedemptionTickets(studentId) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: Record<string, any>, @Res() res: Response) {
    const { code } = body;
    if (!code) {
      return res.status(400).json({ success: false, message: '核销码不能为空' });
    }

    try {
      const result = await this.engagementService.verifyRedemption(code);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
}

@Controller('api/messages')
export class MessagesController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getMessages(@Query() query: Record<string, any>) {
    try {
      return { success: true, messages: await this.engagementService.getMessages(query) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createMessage(@Body() body: Record<string, any>) {
    const { class_id, sender_id, content, type } = body;
    if (!class_id || !sender_id || !content || !type) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'class_id, sender_id, content, and type are required');
    }

    if (type !== 'PEER_REVIEW' && type !== 'TREE_HOLE' && type !== 'HOME_SCHOOL') {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Invalid message type');
    }

    try {
      return {
        success: true,
        message: 'Message sent successfully',
        id: await this.engagementService.createMessage(body),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/family-tasks')
export class FamilyTasksController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * The four handlers below reproduce the legacy catch clause **exactly**: they rethrow Nest's
   * `HttpException` - which is what the controller's own `legacyError` produces - and turn every
   * other error into `500 errorMessage(error)`.
   *
   * That looks like a bug, and it is one, but it is the pre-migration behaviour, verified against
   * git rather than assumed. The legacy handlers caught `HttpException`, while the class-feature
   * gate and `getStudentById` threw the *application's* `ApiError` (`api/utils/apiError.ts`, a
   * different class). So:
   *
   *   - a student whose class has the feature off answered **500 该功能当前已关闭**, not 403;
   *   - a student with no row answered **500 学生未找到**, not 404;
   *   - `PUT`/`DELETE` on a missing task answered **500 Task not found**, not 404.
   *
   * The first version of this file "fixed" that by rethrowing `ApiError` too, which silently turned
   * three documented 500s into 404s - exactly the kind of unrequested behaviour change HANDOFF
   * section 11 warns about. Reverted; the defect is recorded in the manifest's `_known_debt`.
   *
   * `errorMessage` is used rather than a fixed string because that is what the legacy handlers
   * passed, so the 500 body carries the gate's own message.
   */
  @Get()
  async getTasks(@Query() query: Record<string, any>) {
    try {
      const tasks = await this.engagementService.getFamilyTasks(query);
      if (!tasks) throw legacyError(HttpStatus.BAD_REQUEST, 'Missing studentId or parentId');

      return { success: true, tasks };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createTask(@Body() body: Record<string, any>) {
    const { student_id, parent_id, title, points } = body;
    if (!student_id || !parent_id || !title || points === undefined) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    try {
      return { success: true, task: await this.engagementService.createFamilyTask(body) };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Put(':id')
  async updateTask(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      const updated = await this.engagementService.updateFamilyTask(id, body.status);
      if (!updated) throw legacyError(HttpStatus.NOT_FOUND, 'Task not found');

      return { success: true, message: 'Task updated successfully' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete(':id')
  async deleteTask(@Param('id') id: string) {
    try {
      const deleted = await this.engagementService.deleteFamilyTask(id);
      if (!deleted) throw legacyError(HttpStatus.NOT_FOUND, 'Task not found');

      return { success: true, message: 'Task deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/lucky-draw')
export class LuckyDrawController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get('config')
  async getConfig(@Query('teacherId') teacherId?: string) {
    try {
      const result = await this.engagementService.getLuckyDrawConfig(teacherId);
      return { success: true, ...result };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(@Body() body: Record<string, any>) {
    const { configs } = body;
    if (!Array.isArray(configs) || configs.length !== 9) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'configs 必须是长度为 9 的数组');
    }

    try {
      await this.engagementService.updateLuckyDrawConfig(body);
      return { success: true, message: 'Config updated successfully' };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('draw')
  @HttpCode(HttpStatus.OK)
  async draw(@Body() body: Record<string, any>, @Res() res: Response) {
    const { studentId } = body;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    try {
      const result = await this.engagementService.drawLuckyPrize(studentId);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
}

@Controller('api/danmaku')
export class DanmakuController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getMessages(@Query('classId') classId?: string, @Query('since') since?: string) {
    if (!classId) throw legacyError(HttpStatus.BAD_REQUEST, 'classId required');

    try {
      return { success: true, messages: await this.engagementService.getDanmakuMessages(classId, since) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createMessage(@Body() body: Record<string, any>) {
    const { class_id, sender_name, content } = body;
    if (!class_id || !content || !sender_name) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    try {
      return { success: true, message: await this.engagementService.createDanmakuMessage(body) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete('cleanup')
  cleanup() {
    try {
      this.engagementService.cleanupDanmakuMessages();
      return { success: true };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}
