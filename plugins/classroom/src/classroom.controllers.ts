/**
 * Classroom HTTP surface.
 *
 * Six controllers, relocated from `api/modules/classroom/classroom.controllers.ts` with the
 * paths, envelopes and status codes unchanged. Three details in the legacy file are
 * load-bearing and easy to lose in a rewrite:
 *
 *   * **Two controller bases.** The classes controller is registered under both `api/classes`
 *     and `api/class`. The second base is a real alias the frontend still calls (`src/api/*`),
 *     and the endpoint snapshot counts distinct METHOD+PATH pairs - so both bases must be
 *     registered. The same applies to the two-path PUT inside that controller
 *     (`:id/settings` plus `:id/features`): settings and features are two paths on one
 *     handler, which is how the admin page toggles flags.
 *   * **Every POST pins `HttpCode(HttpStatus.OK)`.** Nest defaults POST to 201; the legacy
 *     controllers pinned 200 and the frontend's error handling was written against it.
 *   * **Declaration order matters**, and mirrors the legacy file: the `records` and
 *     `progress-star` GET handlers and the literal POST paths are declared before the
 *     parameterised `:id` GET and the bare POST so those do not swallow them - and inside the
 *     classes controller `invite/:code` precedes `:id` for the same reason.
 *
 * A note on this header, kept because the mistake was real: an earlier revision spelled the
 * classes controller's bases and the two students GET handlers as route decorators, and the
 * HTTP-surface extractor - a regex scan over raw text, not a parser - read them as applied
 * routes. The snapshot grew by exactly four routes Nest never served (`GET /api/class/records`,
 * `GET /api/class/progress-star` and their `api/classes` twins) while every real decorator
 * below was already correct. The extractor now strips comments before scanning
 * (`stripComments` in `scripts/migration/lib/analysis.mjs`), so prose can no longer create
 * endpoints, and a unit test asserts the extractor agrees with Nest's own route metadata for
 * this file. Backticked names without parentheses were always safe; the parenthesised form no
 * longer is a trap either - but the two must not disagree, and that equality is now tested.
 *
 * Authorization: the three student reads (`GET /api/students`, `GET /api/students/:id` and
 * `GET /api/students/records`) hand the request to the service, which resolves the caller from
 * the kernel's verified request context. Anonymous is 401; staff see only the students of the
 * classes they own, a student only their own row and a parent only their linked children
 * (`ClassroomService.listStudents` / `getStudent` / `getRecords`). The invite lookup below is
 * public on purpose - the activation page calls it before login
 * (`src/features/auth/api/authApi.ts`), so it must not gain an actor check.
 *
 * Errors: the service throws the kernel's `ApiError`, and `throwClassroomError` only decides
 * what an *unexpected* error becomes (`'Server error'` for groups/presets, the error's own
 * message for attendance/leaves, `'Internal Server Error'` elsewhere - the legacy fallbacks).
 * The kernel's global filter renders `{success:false, message}` with the error's status.
 */

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { throwClassroomError } from './classroom.errors.js';
import { ClassroomService } from './classroom.service.js';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Internal Server Error');

// Explicit single-element array, matching the classes controller's shape. Nest and the
// surface extractor treat it exactly like the bare string the legacy file used; the shape
// is only observable to a test that reads the path metadata directly.
@Controller(['api/students'])
export class StudentsController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listStudents(@Req() req: Request, @Query('classId') classId?: string) {
    try {
      return { success: true, students: this.classroomService.listStudents(req, classId) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get('records')
  getRecords(@Req() req: Request, @Query() query: Record<string, any>) {
    try {
      return { success: true, records: this.classroomService.getRecords(req, query) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get('progress-star')
  getProgressStar(@Req() req: Request, @Query('classId') classId?: string) {
    try {
      return { success: true, students: this.classroomService.getProgressStar(req, classId) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  checkin(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.checkin(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('gift')
  @HttpCode(HttpStatus.OK)
  gift(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.gift(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('batch-import')
  @HttpCode(HttpStatus.OK)
  batchImport(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.batchImport(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createStudent(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.createStudent(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('batch-points')
  @HttpCode(HttpStatus.OK)
  batchPoints(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.batchPoints(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post('batch-edit')
  @HttpCode(HttpStatus.OK)
  batchEdit(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.batchEdit(req, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id')
  getStudent(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, student: this.classroomService.getStudent(req, id) };
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
  updateStudentPoints(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, student: this.classroomService.updateStudentPoints(req, id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put(':id/birthday')
  updateBirthday(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.updateBirthday(req, id, body) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/achievements')
  getAchievements(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getAchievements(req, id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/peer-reviews/pending')
  getPendingPeerReviews(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, pending: this.classroomService.getPendingPeerReviews(req, id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Post(':id/peer-reviews')
  @HttpCode(HttpStatus.OK)
  createPeerReview(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.createPeerReview(req, id, body) };
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
  getClass(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, class: this.classroomService.getClass(req, id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/features')
  getClassFeatures(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getClassFeatures(req, id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/bigscreen')
  getBigscreen(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getBigscreen(req, id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Get(':id/guild-ranking')
  getGuildRanking(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.getGuildRanking(req, id) };
    } catch (error) {
      throwClassroomError(error);
    }
  }

  @Put([':id/settings', ':id/features'])
  updateClassSettings(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return { success: true, ...this.classroomService.updateClassSettings(req, id, body) };
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
  listPresets(@Req() req: Request, @Query('teacherId') teacherId?: string) {
    try {
      return { success: true, presets: this.classroomService.listPresets(req, teacherId) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createPreset(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, preset: this.classroomService.createPreset(req, body) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }

  @Delete(':id')
  deletePreset(@Req() req: Request, @Param('id') id: string) {
    try {
      return { success: true, ...this.classroomService.deletePreset(req, id) };
    } catch (error) {
      throwClassroomError(error, 'Server error');
    }
  }
}

@Controller('api/attendance')
export class AttendanceController {
  constructor(@Inject(ClassroomService) private readonly classroomService: ClassroomService) {}

  @Get()
  listAttendance(@Req() req: Request, @Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.classroomService.listAttendance(req, query) };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  saveAttendance(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      this.classroomService.saveAttendance(req, body);
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
  listLeaves(@Req() req: Request, @Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.classroomService.listLeaves(req, query) };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  createLeave(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return { success: true, id: this.classroomService.createLeave(req, body) };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }

  @Put(':id')
  updateLeave(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.classroomService.updateLeave(req, id, body);
      return { success: true };
    } catch (error) {
      throwClassroomError(error, errorMessage);
    }
  }
}
