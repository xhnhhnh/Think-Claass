/**
 * Learning HTTP surface - the 24 routes of the papers / paper-submissions / knowledge /
 * wrong-questions / study-plans domain, relocated from
 * `api/modules/learning/learning.controllers.ts` with the same METHOD+PATH, the same
 * envelopes and the same status codes.
 *
 * Three things are deliberate and easy to lose:
 *
 *   * **No `@HttpCode` anywhere.** The legacy controllers had none, so Nest's default
 *     applies: POST answers **201**, PUT and DELETE answer 200. Adding `@HttpCode(200)`
 *     here (as the pet domain needed, because *its* controllers pinned 200) would be a
 *     regression.
 *   * **`ok()` is `{ success: true, data }` and nothing else.** Unlike pet and
 *     assignments, this domain never flattened the payload onto the envelope, so no
 *     duplicate keys exist to preserve. Three routes answer a bare `{ success: true }`
 *     (`PUT /api/paper-submissions/:id/answers`, `DELETE /api/knowledge/nodes/:id`,
 *     `DELETE /api/knowledge/edges/:id`, `POST /api/wrong-questions/:id/attempt`) - the
 *     legacy handlers returned that literal instead of `ok(...)`.
 *   * **Declaration order inside each controller** is the legacy order, which is what
 *     decides first-match for overlapping prefixes (`GET /api/knowledge/nodes` must stay
 *     ahead of nothing, but `GET /api/wrong-questions/my` ahead of `:id` routes does).
 *
 * `throwLearningError` is gone. It wrapped errors in a Nest `HttpException` carrying
 * `{ success: false, message }`, which is exactly what the composition's global filter
 * renders for a thrown kernel `ApiError` - and a plugin may not import `api/**` anyway.
 * Authorization is unchanged in *position*: the legacy service called `requireActorRole`
 * first thing, and here the controller gates the route before delegating, so a request
 * still gets 401/403 ahead of every validation message.
 *
 * The three knowledge-graph reads (`GET /api/knowledge/subjects|nodes|edges`) were the
 * domain's last open routes: the matrix (`docs/security/route-authorization-matrix.md`)
 * rules the graph 登录用户（teacher/student/admin）, so they now carry the same
 * `requireActorRole` gate as the writes. It is a login gate and not a scope filter on
 * purpose - the graph is course content with no user data, so there is nothing to narrow.
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

import { ApiError, getRequestContext } from '@thinkclass/kernel';

import { LearningService } from './learning.service.js';
import type { Actor } from './learning.types.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

/**
 * The caller, as the kernel's request context resolved it.
 *
 * The context middleware is installed in both compositions, and it is the only identity
 * source a plugin may use: it verifies bearer tokens and owns the `x-user-role` /
 * `x-user-id` migration bridge (`ALLOW_LEGACY_HEADER_AUTH`). The legacy
 * `getRequestActor()` fell back to the raw headers only when the middleware had not run,
 * which cannot happen for these routes.
 */
function actorOf(req: Request): Actor {
  const actor = getRequestContext(req).actor;
  return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
}

/** The legacy `requireActorRole`: 401 when unknown, 403 when known but not allowed. */
function requireActorRole(req: Request, allowedRoles: string[]): Actor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}

const STAFF = ['teacher', 'admin', 'superadmin'];
const STUDENT = ['student'];

/**
 * The knowledge graph is course content with no user data, so the matrix's ruling for its three
 * reads is 登录用户（teacher/student/admin） - a login gate, not an ownership filter (there is
 * nothing to narrow). `parent` is deliberately absent: it is not one of the listed roles, and no
 * parent surface in the frontend calls these routes.
 */
const KNOWLEDGE_READERS = ['teacher', 'admin', 'superadmin', 'student'];

@Controller('api/papers')
export class PapersController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get()
  async listPapers(@Req() req: Request, @Query('class_id') classId?: string) {
    return ok(await this.learningService.listPapers(actorOf(req), classId));
  }

  @Post()
  async createPaper(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.createPaper(actor, body));
  }

  @Get(':id')
  async getPaper(@Req() req: Request, @Param('id') id: string) {
    return ok(await this.learningService.getPaper(actorOf(req), id));
  }

  @Put(':id')
  async updatePaper(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.updatePaper(actor, id, body));
  }

  @Put(':id/structure')
  async saveStructure(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.savePaperStructure(actor, id, body));
  }

  @Post(':id/assets')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir() }))
  async uploadAsset(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.uploadPaperAsset(actor, id, file));
  }
}

@Controller('api/paper-submissions')
export class PaperSubmissionsController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Post('start')
  async start(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.startPaperSubmission(actor, body));
  }

  @Put(':id/answers')
  async saveAnswers(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STUDENT);
    await this.learningService.savePaperAnswers(actor, id, body);
    return { success: true };
  }

  @Post(':id/submit')
  async submit(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.submitPaper(actor, id));
  }
}

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get('subjects')
  async getSubjects(@Req() req: Request) {
    // Login gate only: the service needs no actor because the subject list is global content.
    requireActorRole(req, KNOWLEDGE_READERS);
    return ok(await this.learningService.listSubjects());
  }

  @Post('subjects')
  async createSubject(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.createSubject(actor, body));
  }

  @Get('nodes')
  async getNodes(@Req() req: Request, @Query('subject_id') subjectId?: string) {
    requireActorRole(req, KNOWLEDGE_READERS);
    return ok(this.learningService.listKnowledgeNodes(subjectId));
  }

  @Post('nodes')
  async createNode(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.createKnowledgeNode(actor, body));
  }

  @Put('nodes/:id')
  async updateNode(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.updateKnowledgeNode(actor, id, body));
  }

  @Delete('nodes/:id')
  async deleteNode(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STAFF);
    this.learningService.deleteKnowledgeNode(actor, id);
    return { success: true };
  }

  @Get('edges')
  async getEdges(@Req() req: Request, @Query('subject_id') subjectId?: string) {
    requireActorRole(req, KNOWLEDGE_READERS);
    return ok(this.learningService.listKnowledgeEdges(subjectId));
  }

  @Post('edges')
  async createEdge(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STAFF);
    return ok(this.learningService.createKnowledgeEdge(actor, body));
  }

  @Delete('edges/:id')
  async deleteEdge(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STAFF);
    this.learningService.deleteKnowledgeEdge(actor, id);
    return { success: true };
  }
}

@Controller('api/wrong-questions')
export class WrongQuestionsController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get('my')
  async my(@Req() req: Request) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.listWrongQuestions(actor));
  }

  @Post(':id/attempt')
  async attempt(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STUDENT);
    await this.learningService.attemptWrongQuestion(actor, id, body);
    return { success: true };
  }

  @Post(':id/generate')
  async generate(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.generateWrongQuestionPractice(actor, id));
  }
}

@Controller('api/study-plans')
export class StudyPlansController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get('my')
  async my(@Req() req: Request) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.getMyStudyPlan(actor));
  }

  @Post()
  async create(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.createStudyPlan(actor, body));
  }

  @Put('items/:id')
  async updateItem(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, STUDENT);
    return ok(await this.learningService.updateStudyPlanItem(actor, id, body));
  }
}
