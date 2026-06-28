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
import { EngagementService } from './engagement.service.js';

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
      return {
        success: true,
        announcement: this.engagementService.getActiveAnnouncement(),
      };
    } catch (error) {
      console.error('Fetch active announcement error:', error);
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, '获取公告失败');
    }
  }
}

@Controller('api/class-announcements')
export class ClassAnnouncementsController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  getClassAnnouncements(@Query('classId') classId?: string) {
    if (!classId) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'classId is required');
    }

    try {
      return {
        success: true,
        announcements: this.engagementService.getClassAnnouncements(classId),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  createClassAnnouncement(@Body() body: Record<string, any>) {
    const { class_id, teacher_id, title, content } = body;
    if (!class_id || !teacher_id || !title || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    try {
      return {
        success: true,
        announcement: this.engagementService.createClassAnnouncement(body),
      };
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
  getPraises(@Query('classId') classId?: string) {
    if (!classId) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'classId is required');
    }

    try {
      return {
        success: true,
        praises: this.engagementService.getPraisesByClass(classId),
      };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Get('student/:id')
  getStudentPraises(@Param('id') id: string) {
    try {
      return {
        success: true,
        praises: this.engagementService.getPraisesByStudent(id),
      };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Post()
  createPraise(@Body() body: Record<string, any>) {
    const { teacher_id, student_id, content } = body;
    if (!teacher_id || !student_id || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'teacher_id, student_id, and content are required');
    }

    try {
      return {
        success: true,
        praise: this.engagementService.createPraise(body),
      };
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
  getCertificates(@Query('studentId') studentId?: string) {
    try {
      return {
        success: true,
        certificates: this.engagementService.getCertificates(studentId),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  createCertificate(@Body() body: Record<string, any>) {
    const { student_id, title } = body;
    if (!student_id || !title) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'student_id and title are required');
    }

    try {
      return {
        success: true,
        certificate: this.engagementService.createCertificate(body),
      };
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
      return {
        success: true,
        tickets: this.engagementService.getRedemptionTickets(studentId),
      };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('verify')
  verify(@Body() body: Record<string, any>, @Res() res: Response) {
    const { code } = body;
    if (!code) {
      return res.status(400).json({ success: false, message: '核销码不能为空' });
    }

    try {
      const result = this.engagementService.verifyRedemption(code);
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
  getMessages(@Query() query: Record<string, any>) {
    try {
      return {
        success: true,
        messages: this.engagementService.getMessages(query),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  createMessage(@Body() body: Record<string, any>) {
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
        id: this.engagementService.createMessage(body),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/family-tasks')
export class FamilyTasksController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  getTasks(@Query() query: Record<string, any>) {
    try {
      const tasks = this.engagementService.getFamilyTasks(query);
      if (!tasks) {
        throw legacyError(HttpStatus.BAD_REQUEST, 'Missing studentId or parentId');
      }

      return { success: true, tasks };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  createTask(@Body() body: Record<string, any>) {
    const { student_id, parent_id, title, points } = body;
    if (!student_id || !parent_id || !title || points === undefined) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    try {
      return {
        success: true,
        task: this.engagementService.createFamilyTask(body),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Put(':id')
  updateTask(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      const updated = this.engagementService.updateFamilyTask(id, body.status);
      if (!updated) {
        throw legacyError(HttpStatus.NOT_FOUND, 'Task not found');
      }

      return { success: true, message: 'Task updated successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete(':id')
  deleteTask(@Param('id') id: string) {
    try {
      const deleted = this.engagementService.deleteFamilyTask(id);
      if (!deleted) {
        throw legacyError(HttpStatus.NOT_FOUND, 'Task not found');
      }

      return { success: true, message: 'Task deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/lucky-draw')
export class LuckyDrawController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get('config')
  getConfig(@Query('teacherId') teacherId?: string) {
    try {
      const result = this.engagementService.getLuckyDrawConfig(teacherId);
      return { success: true, ...result };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('config')
  saveConfig(@Body() body: Record<string, any>) {
    const { configs } = body;
    if (!Array.isArray(configs) || configs.length !== 9) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'configs 必须是长度为 9 的数组');
    }

    try {
      this.engagementService.updateLuckyDrawConfig(body);
      return { success: true, message: 'Config updated successfully' };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('draw')
  draw(@Body() body: Record<string, any>, @Res() res: Response) {
    const { studentId } = body;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    try {
      const result = this.engagementService.drawLuckyPrize(studentId);
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
  getMessages(@Query('classId') classId?: string, @Query('since') since?: string) {
    if (!classId) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'classId required');
    }

    try {
      return {
        success: true,
        messages: this.engagementService.getDanmakuMessages(classId, since),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  createMessage(@Body() body: Record<string, any>) {
    const { class_id, sender_name, content } = body;
    if (!class_id || !content || !sender_name) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    try {
      return {
        success: true,
        message: this.engagementService.createDanmakuMessage(body),
      };
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
