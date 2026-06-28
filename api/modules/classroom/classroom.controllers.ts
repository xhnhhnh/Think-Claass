import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ClassroomService } from './classroom.service.js';
import { throwClassroomError } from './classroom.errors.js';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Internal Server Error');

@Controller('api/students')
export class StudentsController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listStudents(@Query('classId') classId?: string) {
    try {
      return { success: true, students: this.classroomService.listStudents(classId) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get('records')
  getRecords(@Query() query: Record<string, any>) {
    try {
      return { success: true, records: this.classroomService.getRecords(query) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get('progress-star')
  getProgressStar(@Query('classId') classId?: string) {
    try {
      return { success: true, students: this.classroomService.getProgressStar(classId) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  checkin(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.checkin(body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('gift')
  @HttpCode(HttpStatus.OK)
  gift(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.gift(body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('batch-import')
  @HttpCode(HttpStatus.OK)
  batchImport(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.batchImport(body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createStudent(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.createStudent(body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('batch-points')
  @HttpCode(HttpStatus.OK)
  batchPoints(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.batchPoints(body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('batch-edit')
  @HttpCode(HttpStatus.OK)
  batchEdit(@Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.batchEdit(body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id')
  getStudent(@Param('id') id: string) {
    try {
      return { success: true, student: this.classroomService.getStudent(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put(':id/class')
  updateStudentClass(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.classroomService.updateStudentClass(req, id, body);
      return { success: true };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put(':id/group')
  updateStudentGroup(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.classroomService.updateStudentGroup(req, id, body);
      return { success: true };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put(':id/password')
  resetStudentPassword(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.resetStudentPassword(req, id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post(':id/points')
  @HttpCode(HttpStatus.OK)
  updateStudentPoints(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, student: this.classroomService.updateStudentPoints(id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put(':id/birthday')
  updateBirthday(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.updateBirthday(id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/achievements')
  getAchievements(@Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getAchievements(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/peer-reviews/pending')
  getPendingPeerReviews(@Param('id') id: string) {
    try {
      return { success: true, pending: this.classroomService.getPendingPeerReviews(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post(':id/peer-reviews')
  @HttpCode(HttpStatus.OK)
  createPeerReview(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.createPeerReview(id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }
}

@Controller(['api/classes', 'api/class'])
export class ClassesController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listClasses(@Req() req: Request, @Query('teacherId') teacherId?: string) {
    try {
      return { success: true, classes: this.classroomService.listClasses(req, teacherId) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get('invite/:code')
  getInvite(@Param('code') code: string, @Query('role') role?: string) {
    try {
      return { success: true, ...this.classroomService.getInvite(code, role) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createClass(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, class: this.classroomService.createClass(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id')
  getClass(@Param('id') id: string) {
    try {
      return { success: true, class: this.classroomService.getClass(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/features')
  getClassFeatures(@Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getClassFeatures(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/bigscreen')
  getBigscreen(@Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getBigscreen(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/guild-ranking')
  getGuildRanking(@Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getGuildRanking(id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put([':id/settings', ':id/features'])
  updateClassSettings(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.updateClassSettings(id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }
}

@Controller('api/groups')
export class GroupsController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listGroups(@Req() req: Request, @Query('classId') classId?: string) {
    try {
      return { success: true, groups: this.classroomService.listGroups(req, classId) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createGroup(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, group: this.classroomService.createGroup(req, body) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }

  @Post('assign')
  @HttpCode(HttpStatus.OK)
  assignStudent(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.assignStudent(req, body) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }
}

@Controller('api/presets')
export class PresetsController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listPresets(@Query('teacherId') teacherId?: string) {
    try {
      return { success: true, presets: this.classroomService.listPresets(teacherId) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createPreset(@Body() body: Record<string, any>) {
    try {
      return { success: true, preset: this.classroomService.createPreset(body) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }

  @Delete(':id')
  deletePreset(@Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.deletePreset(id) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }
}

@Controller('api/attendance')
export class AttendanceController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listAttendance(@Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.classroomService.listAttendance(query) };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  saveAttendance(@Body() body: Record<string, any>) {
    try {
      this.classroomService.saveAttendance(body);
      return { success: true };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }
}

@Controller('api/leaves')
export class LeavesController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listLeaves(@Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.classroomService.listLeaves(query) };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createLeave(@Body() body: Record<string, any>) {
    try {
      return { success: true, id: this.classroomService.createLeave(body) };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }

  @Put(':id')
  updateLeave(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.classroomService.updateLeave(id, body);
      return { success: true };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }
}
