/**
 * homework HTTP surface.
 *
 * ## Shapes worth knowing before editing
 *
 *   - Every route is `auth: "actor"` in the manifest and calls `requireActorRole` before it does
 *     anything else, so a 401/403 is produced before any validation message and the service is never
 *     reached for an unpermitted caller.
 *   - `ok()` is `{ success: true, data }` and nothing else. Unlike `plugins/assignments` there is no
 *     legacy envelope to preserve here, so the flattened duplicate keys that plugin carries
 *     (`{ success, data: { id }, id }`) are deliberately NOT reproduced. See the manifest's
 *     `_envelope_note`.
 *   - No `@HttpCode` anywhere: Nest's defaults apply, which is POST 201 and PUT/DELETE 200. The pet
 *     domain needed explicit 200s because *its* controllers pinned them; this domain has no such
 *     history, so adding one would be an invented difference.
 *   - Query and body shapes are named interfaces rather than inline object types. That is not
 *     cosmetic: the route-authorization audit locates a handler's body with a parameter scan that
 *     stops at the first `{`, so an inline type makes it read the handler as having no body at all
 *     - and therefore as unguarded. `plugins/assignments` records the same constraint.
 *
 * ## Where the actor comes from
 *
 * `homework.authorization.ts`, which reads the kernel's request context and nothing else. The
 * service receives that actor as its first argument and derives every ownership decision from it -
 * `teacher_id` and `student_id` on a create are never taken from the body.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import os from 'node:os';

import type {
  HomeworkAiGeneratePayload,
  HomeworkAiGradePayload,
  HomeworkGradePayload,
  HomeworkPublishPayload,
  HomeworkSaveAnswersPayload,
  HomeworkSubmitPayload,
  HomeworkUpdatePayload,
} from '@thinkclass/contracts/domains/homework';

import { CLASS_READERS, MY_HOMEWORK_READERS, RECORD_READERS, STUDENT_ONLY, requireActorRole, TEACHER_WRITER } from './homework.authorization.js';
import { HomeworkService } from './homework.service.js';

function ok<T>(data: T) {
  return { success: true, data };
}

/** The list routes' query. `class_id` narrows; `student_id` is honoured only for staff. */
interface HomeworkListQuery {
  class_id?: string;
  student_id?: string;
}

/** The student's own-question read/write, which staff call on a named pupil's behalf. */
interface QaQuery {
  student_id?: string;
}

interface QaAskBody {
  content?: string;
  question_id?: number;
}

@Controller('api/homework')
export class HomeworkController {
  constructor(@Inject(HomeworkService) private readonly homeworkService: HomeworkService) {}

  // -- homework ------------------------------------------------------------

  @Get()
  listHomeworks(@Req() req: Request, @Query('class_id') classId?: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    return ok(this.homeworkService.listHomeworks(actor, classId));
  }

  @Post()
  createHomework(@Req() req: Request, @Body() body: HomeworkPublishPayload) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(this.homeworkService.createHomework(actor, body));
  }

  /**
   * Declared before `GET :id` on purpose.
   *
   * Nest matches in declaration order, so a `:id` route registered first would swallow `/my` and
   * answer `400 id is invalid` for every student opening their own list. `plugins/learning` records
   * the same ordering hazard for `GET /api/wrong-questions/my`.
   */
  @Get('my')
  listMyHomeworks(@Req() req: Request) {
    const actor = requireActorRole(req, MY_HOMEWORK_READERS);
    return ok(this.homeworkService.listMyHomeworks(actor));
  }

  @Get(':id')
  getHomework(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    return ok(this.homeworkService.getHomework(actor, id));
  }

  @Put(':id')
  updateHomework(@Req() req: Request, @Param('id') id: string, @Body() body: HomeworkUpdatePayload) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(this.homeworkService.updateHomework(actor, id, body));
  }

  @Delete(':id')
  deleteHomework(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(this.homeworkService.deleteHomework(actor, id));
  }

  // -- the grade sheet and AI ----------------------------------------------

  @Get(':id/submissions')
  listSubmissions(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(this.homeworkService.listSubmissions(actor, id));
  }

  @Post(':id/ai-grade')
  async aiGrade(@Req() req: Request, @Param('id') id: string, @Body() body: HomeworkAiGradePayload) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(await this.homeworkService.aiGrade(actor, id, body));
  }

  /**
   * 出题 - the AI drafts questions for the dialog the teacher is already holding.
   *
   * Declared **before** the `:id` routes, and not under one: nothing here reads or writes a row, so
   * there is no homework to key it on. `POST :id/ai-grade` would not match it - different shape - but
   * the sibling `POST :id/qa` is close enough that the ordering is worth stating rather than relying
   * on segment counts.
   *
   * The body is a named interface rather than an inline type: the route-authorization audit locates
   * a handler's body with a parameter scan that stops at the first `{`, so an inline type makes it
   * read the handler as unguarded.
   */
  @Post('ai/questions')
  async generateQuestions(@Req() req: Request, @Body() body: HomeworkAiGeneratePayload) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(await this.homeworkService.generateQuestions(actor, body ?? { topic: '' }));
  }

  @Get(':id/qa')
  listQa(@Req() req: Request, @Param('id') id: string, @Query() query: QaQuery) {
    const actor = requireActorRole(req, RECORD_READERS);
    return ok(this.homeworkService.listQa(actor, id, query?.student_id));
  }

  @Post(':id/qa')
  async askQa(@Req() req: Request, @Param('id') id: string, @Body() body: QaAskBody) {
    const actor = requireActorRole(req, RECORD_READERS);
    return ok(await this.homeworkService.askQa(actor, id, body ?? {}));
  }

  // -- the student's own attempt ------------------------------------------

  @Post(':id/attempt')
  startAttempt(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STUDENT_ONLY);
    return ok(this.homeworkService.startAttempt(actor, id));
  }

  @Get('submissions/:id')
  getSubmission(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, RECORD_READERS);
    return ok(this.homeworkService.getSubmission(actor, id));
  }

  @Put('submissions/:id')
  gradeSubmission(@Req() req: Request, @Param('id') id: string, @Body() body: HomeworkGradePayload) {
    const actor = requireActorRole(req, TEACHER_WRITER);
    return ok(this.homeworkService.gradeSubmission(actor, id, body));
  }

  @Put('submissions/:id/answers')
  saveAnswers(@Req() req: Request, @Param('id') id: string, @Body() body: HomeworkSaveAnswersPayload) {
    const actor = requireActorRole(req, STUDENT_ONLY);
    return ok(this.homeworkService.saveAnswers(actor, id, body ?? {}));
  }

  /**
   * The 拍照题 half.
   *
   * `FileInterceptor` writes the upload to the OS temp directory and the service moves it into
   * `uploads/homework` - the same two-step `plugins/learning` uses for paper assets, and for the
   * same reason: multer's destination must be a directory it can guarantee exists, while the final
   * location is application policy (`config.uploadsDir`, served statically by `api/app.ts`).
   */
  @Post('submissions/:id/photos')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir() }))
  uploadPhoto(@Req() req: Request, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    const actor = requireActorRole(req, STUDENT_ONLY);
    return ok(this.homeworkService.uploadPhoto(actor, id, file));
  }

  @Post('submissions/:id/submit')
  submitAttempt(@Req() req: Request, @Param('id') id: string, @Body() body: HomeworkSubmitPayload) {
    const actor = requireActorRole(req, STUDENT_ONLY);
    return ok(this.homeworkService.submitAttempt(actor, id, body ?? {}));
  }
}
