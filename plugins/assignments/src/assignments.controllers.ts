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
 *
 * Every handler now resolves the caller first (`requireActorRole`): 401 when the request carries
 * no verified actor, 403 when the actor's role may not use the route. That is the whole of the
 * role gate - what a permitted role may *see* is decided by the service from the same actor
 * (`assignments.service.ts`), so `GET /api/assignments` returns a teacher their own rows rather
 * than merely refusing an anonymous reader. The role lists are the 应属角色 column of
 * `docs/security/route-authorization-matrix.md`, reproduced in `assignments.authorization.ts`.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type {
  AssignmentPayload,
  ExamPayload,
  SaveExamGradePayload,
  StudentAssignmentUpdatePayload,
} from '@thinkclass/contracts/domains/learning';

import { CLASS_READERS, RECORD_READERS, requireActorRole, STAFF, TEACHER } from './assignments.authorization.js';
import { AssignmentsService, ExamsService } from './assignments.service.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/**
 * Query / body shapes, named rather than written inline.
 *
 * That is not cosmetic: the route-authorization audit (`scripts/security/route-authorization-audit.mjs`)
 * locates each handler's body with a parameter scan that stops at the first `{` or `;`, so an inline
 * object type makes it read the handler as having no body at all - and therefore as unguarded. Named
 * interfaces keep the signatures brace-free. The shapes themselves are the legacy ones.
 */
interface StudentAssignmentsQuery {
  student_id?: string;
  assignment_id?: string;
}

interface StudentExamsQuery {
  student_id?: string;
  exam_id?: string;
}

interface StudentExamUpdateBody {
  score: number | null;
  feedback?: string | null;
}

interface SaveGradesBody {
  grades?: SaveExamGradePayload[];
}

@Controller('api/assignments')
export class AssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly assignmentsService: AssignmentsService) {}

  @Get()
  listAssignments(@Req() req: Request, @Query('class_id') classId?: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    return ok(this.assignmentsService.listAssignments(actor, classId));
  }

  @Post()
  createAssignment(@Req() req: Request, @Body() body: AssignmentPayload) {
    const actor = requireActorRole(req, STAFF);
    const data = this.assignmentsService.createAssignment(actor, body);
    return ok(data, data as unknown as Record<string, unknown>);
  }

  @Get('student-assignments')
  listStudentAssignments(@Req() req: Request, @Query() query: StudentAssignmentsQuery) {
    const actor = requireActorRole(req, RECORD_READERS);
    return ok(this.assignmentsService.listStudentAssignments(actor, query));
  }

  @Put('student-assignments/:id')
  updateStudentAssignment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: StudentAssignmentUpdatePayload,
  ) {
    const actor = requireActorRole(req, TEACHER);
    return ok(this.assignmentsService.updateStudentAssignment(actor, id, body));
  }

  @Put(':id')
  updateAssignment(@Req() req: Request, @Param('id') id: string, @Body() body: AssignmentPayload) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.assignmentsService.updateAssignment(actor, id, body));
  }

  @Delete(':id')
  deleteAssignment(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.assignmentsService.deleteAssignment(actor, id));
  }
}

@Controller('api/exams')
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Get()
  listExams(@Req() req: Request, @Query('class_id') classId?: string) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.examsService.listExams(actor, classId));
  }

  @Post()
  createExam(@Req() req: Request, @Body() body: ExamPayload) {
    const actor = requireActorRole(req, STAFF);
    const data = this.examsService.createExam(actor, body);
    return ok(data, data as unknown as Record<string, unknown>);
  }

  @Get('student-exams')
  listStudentExams(@Req() req: Request, @Query() query: StudentExamsQuery) {
    const actor = requireActorRole(req, RECORD_READERS);
    return ok(this.examsService.listStudentExams(actor, query));
  }

  @Put('student-exams/:id')
  updateStudentExam(@Req() req: Request, @Param('id') id: string, @Body() body: StudentExamUpdateBody) {
    const actor = requireActorRole(req, TEACHER);
    return ok(this.examsService.updateStudentExam(actor, id, body));
  }

  @Get(':id/grades')
  getGrades(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STAFF);
    const data = this.examsService.getGrades(actor, id);
    return ok(data, data as unknown as Record<string, unknown>);
  }

  @Put(':id/grades')
  saveGrades(@Req() req: Request, @Param('id') id: string, @Body() body: SaveGradesBody) {
    const actor = requireActorRole(req, TEACHER);
    return ok(this.examsService.saveGrades(actor, id, body?.grades as SaveExamGradePayload[]));
  }

  @Put(':id')
  updateExam(@Req() req: Request, @Param('id') id: string, @Body() body: ExamPayload) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.examsService.updateExam(actor, id, body));
  }

  @Delete(':id')
  deleteExam(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.examsService.deleteExam(actor, id));
  }
}
