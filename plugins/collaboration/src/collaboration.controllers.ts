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
 * Authorization is intentionally NOT added here. No route in this domain ever read the
 * request actor (the pre-migration controllers never injected `Req`), and changing that
 * is the "systematic authorization" work that lands with plugin permission
 * declarations, not with a relocation.
 */

import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { CollaborationService } from './collaboration.service.js';

@Controller('api/task-tree')
export class TaskTreeController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get('teacher/:classId')
  async listTeacherNodes(@Param('classId') classId: string) {
    return { success: true, nodes: await this.collaborationService.listTeacherNodes(classId) };
  }

  @Post('teacher')
  async createTeacherNode(@Body() body: Record<string, any>) {
    return { success: true, node: await this.collaborationService.createTeacherNode(body) };
  }

  @Put('teacher/:id')
  async updateTeacherNode(@Param('id') id: string, @Body() body: Record<string, any>) {
    await this.collaborationService.updateTeacherNode(id, body);
    return { success: true };
  }

  @Delete('teacher/:id')
  async deleteTeacherNode(@Param('id') id: string) {
    await this.collaborationService.deleteTeacherNode(id);
    return { success: true };
  }

  @Get('student/:studentId')
  async getStudentTree(@Param('studentId') studentId: string) {
    return { success: true, nodes: await this.collaborationService.getStudentTree(studentId) };
  }

  @Post('student/:studentId/complete/:nodeId')
  async completeStudentNode(@Param('studentId') studentId: string, @Param('nodeId') nodeId: string) {
    await this.collaborationService.completeStudentNode(studentId, nodeId);
    return { success: true };
  }
}

@Controller('api/team-quests')
export class TeamQuestsController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get()
  async listTeamQuests(@Query() query: Record<string, any>) {
    return { success: true, data: this.collaborationService.listTeamQuests(query) };
  }

  @Post()
  async createTeamQuest(@Body() body: Record<string, any>) {
    return { success: true, id: this.collaborationService.createTeamQuest(body) };
  }

  @Put(':id')
  async updateTeamQuest(@Param('id') id: string, @Body() body: Record<string, any>) {
    this.collaborationService.updateTeamQuest(id, body);
    return { success: true };
  }

  @Delete(':id')
  async deleteTeamQuest(@Param('id') id: string) {
    this.collaborationService.deleteTeamQuest(id);
    return { success: true };
  }

  @Get('progress/groups')
  async listGroupProgress(@Query() query: Record<string, any>) {
    return { success: true, data: await this.collaborationService.listGroupProgress(query) };
  }

  @Get('student/current')
  async getStudentCurrentQuest(@Query() query: Record<string, any>) {
    return { success: true, ...(await this.collaborationService.getStudentCurrentQuest(query)) };
  }

  @Get('progress')
  async listTeamQuestProgress(@Query() query: Record<string, any>) {
    return { success: true, data: this.collaborationService.listTeamQuestProgress(query) };
  }

  @Post('progress')
  async addTeamQuestProgress(@Body() body: Record<string, any>) {
    return { success: true, id: await this.collaborationService.addTeamQuestProgress(body) };
  }
}

@Controller('api/peer-reviews')
export class PeerReviewsController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get()
  async listPeerReviews(@Query() query: Record<string, any>) {
    return { success: true, data: this.collaborationService.listPeerReviews(query) };
  }

  @Post()
  async createPeerReview(@Body() body: Record<string, any>) {
    return { success: true, id: this.collaborationService.createPeerReview(body) };
  }
}
