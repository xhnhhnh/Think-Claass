/**
 * Collaboration HTTP surface: task tree, team quests and peer reviews.
 *
 * Relocated from `api/modules/collaboration/collaboration.controllers.ts`. Paths,
 * methods and response envelopes are unchanged - the endpoint snapshot (292 endpoints)
 * and the deployed frontend both depend on them. Three controllers keep their three
 * distinct bases (`/api/task-tree`, `/api/team-quests`, `/api/peer-reviews`); collapsing
 * them into `/api/collaboration` would break every existing client, and the manifest's
 * route declarations carry the legacy bases on purpose.
 *
 * Two things changed shape with the migration, and only two:
 *
 *   1. the handlers are `async`, because the service now reaches `students` and
 *      `records` through `classroom.public`;
 *   2. the `try/catch -> throwCollaborationError/throwTaskTreeError` wrapper is gone.
 *      That translator existed to turn the legacy `api/utils/apiError.ts` class into a
 *      Nest `HttpException`; this plugin throws the kernel's `ApiError`, which both
 *      compositions render through the same envelope with the same status (legacy
 *      `api/app.ts` `useGlobalFilters` -> `renderError`). Keeping the wrapper would mean
 *      importing `api/**` and would also mis-translate the kernel class.
 *
 * The task-tree translator had a second, less obvious effect: it flattened *every*
 * feature-gate failure into a 500. That flattening is deliberately dropped here - the
 * migration brief specifies the 403/404 mapping the other migrated domains use - and it
 * is reported to the Lead as the one observable status change in this domain.
 *
 * ## Authorization
 *
 * The matrix calls this file "整族无鉴权" - all 16 routes were open, because the
 * pre-migration controllers never injected `Req` and the service therefore never saw an
 * actor. Every handler now resolves the caller first (401 for anonymous, 403 for a role the
 * matrix does not list) and then asks the service whether the named class/student/node/quest
 * is one the actor owns. Who owns what is resolved through `classroom.public` on every
 * request - never from the URL, the body or `Actor.studentId`:
 *
 *   - the class tree, its nodes and its quests belong to the teacher who owns the class;
 *   - a student's tree and progress belong to that student (and to their parent, for reads);
 *   - `GET /api/team-quests` with no `class_id` answers the actor's own classes, not the
 *     whole table, and `GET /api/peer-reviews` answers only the rows the actor is party to;
 *   - `POST /api/peer-reviews` signs the review with the caller: `reviewer_id` came from the
 *     body, so anyone could submit reviews as any student.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ApiError } from '@thinkclass/kernel';

import { requireActorRole, STAFF_ROLES } from './collaboration.authorization.js';
import { CollaborationService } from './collaboration.service.js';

@Controller('api/task-tree')
export class TaskTreeController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get('teacher/:classId')
  async listTeacherNodes(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, ['teacher', ...STAFF_ROLES]);
    await this.collaborationService.assertClassAccess(actor, classId);

    return { success: true, nodes: await this.collaborationService.listTeacherNodes(classId) };
  }

  @Post('teacher')
  async createTeacherNode(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    // `class_id` is validated by the service (400) when absent; when present it must be a class
    // the actor owns.
    if (body?.class_id !== undefined && body?.class_id !== null && body?.class_id !== '') {
      await this.collaborationService.assertClassAccess(actor, body.class_id);
    }

    return { success: true, node: await this.collaborationService.createTeacherNode(body) };
  }

  @Put('teacher/:id')
  async updateTeacherNode(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    // A missing node returns null here and the service keeps its legacy 404.
    await this.collaborationService.assertTeacherNodeAccess(actor, id);

    await this.collaborationService.updateTeacherNode(id, body);
    return { success: true };
  }

  @Delete('teacher/:id')
  async deleteTeacherNode(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    await this.collaborationService.assertTeacherNodeAccess(actor, id);

    await this.collaborationService.deleteTeacherNode(id);
    return { success: true };
  }

  @Get('student/:studentId')
  async getStudentTree(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, ['student', 'parent', 'teacher']);
    // The tree is the student's own, their parent's child's, or a student of the teacher's class.
    await this.collaborationService.assertStudentAccess(actor, studentId);

    return { success: true, nodes: await this.collaborationService.getStudentTree(studentId) };
  }

  @Post('student/:studentId/complete/:nodeId')
  async completeStudentNode(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Param('nodeId') nodeId: string,
  ) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    // Completing a node pays a reward, so the student must be one the actor owns.
    await this.collaborationService.assertStudentAccess(actor, studentId);

    await this.collaborationService.completeStudentNode(studentId, nodeId);
    return { success: true };
  }
}

@Controller('api/team-quests')
export class TeamQuestsController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get()
  async listTeamQuests(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    const filter: Record<string, any> = { ...(query ?? {}) };
    const classId = filter.class_id;
    if (classId !== undefined && classId !== null && classId !== '') {
      await this.collaborationService.assertClassAccess(actor, classId);
    } else {
      // No class named: the actor's own classes, never the whole table.
      filter.classIds = (await this.collaborationService.scopedClassIds(actor)) ?? [];
    }

    return { success: true, data: this.collaborationService.listTeamQuests(filter) };
  }

  @Post()
  async createTeamQuest(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    const hasClass = body?.class_id !== undefined && body?.class_id !== null && body?.class_id !== '';
    if (!hasClass) {
      // The service answers its legacy 400 for a missing class.
      return { success: true, id: this.collaborationService.createTeamQuest(body) };
    }

    const classId = await this.collaborationService.assertClassAccess(actor, body.class_id);
    // The quest is signed by the caller (a teacher) or by the class's own teacher (a student's
    // request) - `teacher_id` used to be free text from the body.
    const teacherId =
      actor.role === 'teacher' ? actor.id : await this.collaborationService.classTeacherId(classId);

    return {
      success: true,
      id: this.collaborationService.createTeamQuest({ ...body, class_id: classId, teacher_id: teacherId }),
    };
  }

  @Put(':id')
  async updateTeamQuest(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    // A missing quest returns null here; the service keeps answering its legacy 404.
    await this.collaborationService.assertTeamQuestAccess(actor, id);

    this.collaborationService.updateTeamQuest(id, body);
    return { success: true };
  }

  @Delete(':id')
  async deleteTeamQuest(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    await this.collaborationService.assertTeamQuestAccess(actor, id);

    this.collaborationService.deleteTeamQuest(id);
    return { success: true };
  }

  @Get('progress/groups')
  async listGroupProgress(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    const classId = query?.class_id;
    if (classId !== undefined && classId !== null && classId !== '') {
      await this.collaborationService.assertClassAccess(actor, classId);
    }

    return { success: true, data: await this.collaborationService.listGroupProgress(query) };
  }

  @Get('student/current')
  async getStudentCurrentQuest(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    const studentId = query?.student_id;
    if (studentId !== undefined && studentId !== null && studentId !== '') {
      await this.collaborationService.assertStudentAccess(actor, studentId);
    }

    return { success: true, ...(await this.collaborationService.getStudentCurrentQuest(query)) };
  }

  @Get('progress')
  async listTeamQuestProgress(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    const filter: Record<string, any> = { ...(query ?? {}) };

    const questId = filter.quest_id;
    if (questId !== undefined && questId !== null && questId !== '') {
      await this.collaborationService.assertTeamQuestAccess(actor, questId);
    }

    const studentId = filter.student_id;
    if (studentId !== undefined && studentId !== null && studentId !== '') {
      await this.collaborationService.assertStudentAccess(actor, studentId);
    } else {
      // No student named: the actor's own roster, never every row in the table.
      filter.studentIds = (await this.collaborationService.scopedStudentIds(actor)) ?? [];
    }

    return { success: true, data: this.collaborationService.listTeamQuestProgress(filter) };
  }

  @Post('progress')
  async addTeamQuestProgress(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    const studentId = body?.student_id;
    if (studentId === undefined || studentId === null || studentId === '') {
      // The service answers its legacy 400 for a missing student.
      return { success: true, id: await this.collaborationService.addTeamQuestProgress(body) };
    }

    await this.collaborationService.assertStudentAccess(actor, studentId);
    return { success: true, id: await this.collaborationService.addTeamQuestProgress(body) };
  }
}

@Controller('api/peer-reviews')
export class PeerReviewsController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get()
  async listPeerReviews(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    // `peer_reviews` has no class column: the scope is the two student ids on the row.
    return { success: true, data: await this.collaborationService.listPeerReviewsFor(actor, query) };
  }

  @Post()
  async createPeerReview(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['student']);
    const reviewerId = await this.collaborationService.ownStudentId(actor);
    if (reviewerId === null) throw new ApiError(403, '无权限执行该操作');

    // The review is written by the caller: `reviewer_id` came from the body, so a student could
    // submit reviews as any classmate.
    return { success: true, id: this.collaborationService.createPeerReview({ ...body, reviewer_id: reviewerId }) };
  }
}
