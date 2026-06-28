import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { CollaborationService } from './collaboration.service.js';
import { throwCollaborationError, throwTaskTreeError } from './collaboration.errors.js';

@Controller('api/task-tree')
export class TaskTreeController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get('teacher/:classId')
  listTeacherNodes(@Param('classId') classId: string) {
    try {
      return { success: true, nodes: this.collaborationService.listTeacherNodes(classId) };
    } catch (error) {
      throwTaskTreeError(error);
    }
  }

  @Post('teacher')
  createTeacherNode(@Body() body: Record<string, any>) {
    try {
      return { success: true, node: this.collaborationService.createTeacherNode(body) };
    } catch (error) {
      throwTaskTreeError(error);
    }
  }

  @Put('teacher/:id')
  updateTeacherNode(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.collaborationService.updateTeacherNode(id, body);
      return { success: true };
    } catch (error) {
      throwTaskTreeError(error);
    }
  }

  @Delete('teacher/:id')
  deleteTeacherNode(@Param('id') id: string) {
    try {
      this.collaborationService.deleteTeacherNode(id);
      return { success: true };
    } catch (error) {
      throwTaskTreeError(error);
    }
  }

  @Get('student/:studentId')
  getStudentTree(@Param('studentId') studentId: string) {
    try {
      return { success: true, nodes: this.collaborationService.getStudentTree(studentId) };
    } catch (error) {
      throwTaskTreeError(error);
    }
  }

  @Post('student/:studentId/complete/:nodeId')
  completeStudentNode(@Param('studentId') studentId: string, @Param('nodeId') nodeId: string) {
    try {
      this.collaborationService.completeStudentNode(studentId, nodeId);
      return { success: true };
    } catch (error) {
      throwTaskTreeError(error);
    }
  }
}

@Controller('api/team-quests')
export class TeamQuestsController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get()
  listTeamQuests(@Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.collaborationService.listTeamQuests(query) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Post()
  createTeamQuest(@Body() body: Record<string, any>) {
    try {
      return { success: true, id: this.collaborationService.createTeamQuest(body) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Put(':id')
  updateTeamQuest(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      this.collaborationService.updateTeamQuest(id, body);
      return { success: true };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Delete(':id')
  deleteTeamQuest(@Param('id') id: string) {
    try {
      this.collaborationService.deleteTeamQuest(id);
      return { success: true };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Get('progress/groups')
  listGroupProgress(@Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.collaborationService.listGroupProgress(query) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Get('student/current')
  getStudentCurrentQuest(@Query() query: Record<string, any>) {
    try {
      return { success: true, ...this.collaborationService.getStudentCurrentQuest(query) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Get('progress')
  listTeamQuestProgress(@Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.collaborationService.listTeamQuestProgress(query) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Post('progress')
  addTeamQuestProgress(@Body() body: Record<string, any>) {
    try {
      return { success: true, id: this.collaborationService.addTeamQuestProgress(body) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }
}

@Controller('api/peer-reviews')
export class PeerReviewsController {
  constructor(@Inject(CollaborationService) private readonly collaborationService: CollaborationService) {}

  @Get()
  listPeerReviews(@Query() query: Record<string, any>) {
    try {
      return { success: true, data: this.collaborationService.listPeerReviews(query) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }

  @Post()
  createPeerReview(@Body() body: Record<string, any>) {
    try {
      return { success: true, id: this.collaborationService.createPeerReview(body) };
    } catch (error) {
      throwCollaborationError(error);
    }
  }
}
