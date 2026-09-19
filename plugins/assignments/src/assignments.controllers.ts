/**
 * Assignments + exams HTTP surface.
 *
 * Relocated from `api/modules/learning/learning.controllers.ts` (the `AssignmentsController`
 * and `ExamsController` classes of that file); the 14 routes and their envelope shapes are
 * unchanged. Two shape details are deliberate and easy to "tidy" by mistake:
 *
 *   - `createAssignment` / `createExam` call `ok(data, data)`, which spreads the *result*
 *     into the envelope as well as nesting it: the body is
 *     `{ success: true, data: { id }, id }`. That redundancy ships to the frontend.
 *   - `getGrades` does the same: `{ success: true, data: { exam, grades }, exam, grades }`.
 *
 * `throwLearningError` is gone: it wrapped errors in an `HttpException` carrying
 * `{ success: false, message }`, which is what the composition's global filter already
 * renders for a thrown `ApiError` - and a plugin may not import `@nestjs/common`'s
 * exception types from `api/**` anyway. A plugin throws the kernel's `ApiError`.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import type { AssignmentPayload, ExamPayload, StudentAssignmentUpdatePayload } from '@thinkclass/contracts/domains/learning';

import { AssignmentsService, ExamsService } from './assignments.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/assignments')
export class AssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly assignmentsService: AssignmentsService) {}

  @Get()
  listAssignments(@Query('class_id') classId?: string) {
    return ok(this.assignmentsService.listAssignments(classId));
  }

  @Post()
  createAssignment(@Body() body: AssignmentPayload) {
    const data = this.assignmentsService.createAssignment(body);
    return ok(data, data as unknown as Record<string, unknown>);
  }

  @Get('student-assignments')
  listStudentAssignments(@Query() query: { student_id?: string; assignment_id?: string }) {
    return ok(this.assignmentsService.listStudentAssignments(query));
  }

  @Put('student-assignments/:id')
  updateStudentAssignment(@Param('id') id: string, @Body() body: StudentAssignmentUpdatePayload) {
    return ok(this.assignmentsService.updateStudentAssignment(id, body));
  }

  @Put(':id')
  updateAssignment(@Param('id') id: string, @Body() body: AssignmentPayload) {
    return ok(this.assignmentsService.updateAssignment(id, body));
  }

  @Delete(':id')
  deleteAssignment(@Param('id') id: string) {
    return ok(this.assignmentsService.deleteAssignment(id));
  }
}

@Controller('api/exams')
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Get()
  listExams(@Query('class_id') classId?: string) {
    return ok(this.examsService.listExams(classId));
  }

  @Post()
  createExam(@Body() body: ExamPayload) {
    const data = this.examsService.createExam(body);
    return ok(data, data as unknown as Record<string, unknown>);
  }

  @Get('student-exams')
  listStudentExams(@Query() query: { student_id?: string; exam_id?: string }) {
    return ok(this.examsService.listStudentExams(query));
  }

  @Put('student-exams/:id')
  updateStudentExam(@Param('id') id: string, @Body() body: { score: number | null; feedback?: string | null }) {
    return ok(this.examsService.updateStudentExam(id, body));
  }

  @Get(':id/grades')
  getGrades(@Param('id') id: string) {
    const data = this.examsService.getGrades(id);
    return ok(data, data as unknown as Record<string, unknown>);
  }

  @Put(':id/grades')
  saveGrades(@Param('id') id: string, @Body() body: { grades?: never[] }) {
    return ok(this.examsService.saveGrades(id, body?.grades as never));
  }

  @Put(':id')
  updateExam(@Param('id') id: string, @Body() body: ExamPayload) {
    return ok(this.examsService.updateExam(id, body));
  }

  @Delete(':id')
  deleteExam(@Param('id') id: string) {
    return ok(this.examsService.deleteExam(id));
  }
}
