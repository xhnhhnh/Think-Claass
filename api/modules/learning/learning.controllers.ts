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
import os from 'os';
import { AssignmentsService } from './assignments.service.js';
import { ExamsService } from './exams.service.js';
import { LearningService } from './learning.service.js';
import { throwLearningError } from './learning.errors.js';

function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}

@Controller('api/assignments')
export class AssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly assignmentsService: AssignmentsService) {}

  @Get()
  listAssignments(@Query('class_id') classId?: string) {
    try {
      return ok(this.assignmentsService.listAssignments(classId));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post()
  createAssignment(@Body() body: Record<string, any>) {
    try {
      const data = this.assignmentsService.createAssignment(body as any);
      return ok(data, data);
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Get('student-assignments')
  listStudentAssignments(@Query() query: Record<string, any>) {
    try {
      return ok(this.assignmentsService.listStudentAssignments(query));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put('student-assignments/:id')
  updateStudentAssignment(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.assignmentsService.updateStudentAssignment(id, body as any));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put(':id')
  updateAssignment(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.assignmentsService.updateAssignment(id, body as any));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Delete(':id')
  deleteAssignment(@Param('id') id: string) {
    try {
      return ok(this.assignmentsService.deleteAssignment(id));
    } catch (error) {
      throwLearningError(error);
    }
  }
}

@Controller('api/exams')
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Get()
  listExams(@Query('class_id') classId?: string) {
    try {
      return ok(this.examsService.listExams(classId));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post()
  createExam(@Body() body: Record<string, any>) {
    try {
      const data = this.examsService.createExam(body as any);
      return ok(data, data);
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Get('student-exams')
  listStudentExams(@Query() query: Record<string, any>) {
    try {
      return ok(this.examsService.listStudentExams(query));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put('student-exams/:id')
  updateStudentExam(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.examsService.updateStudentExam(id, body as any));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Get(':id/grades')
  getGrades(@Param('id') id: string) {
    try {
      const data = this.examsService.getGrades(id);
      return ok(data, data);
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put(':id/grades')
  saveGrades(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.examsService.saveGrades(id, body?.grades));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put(':id')
  updateExam(@Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(this.examsService.updateExam(id, body as any));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Delete(':id')
  deleteExam(@Param('id') id: string) {
    try {
      return ok(this.examsService.deleteExam(id));
    } catch (error) {
      throwLearningError(error);
    }
  }
}

@Controller('api/papers')
export class PapersController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get()
  async listPapers(@Req() req: Request, @Query('class_id') classId?: string) {
    try {
      return ok(await this.learningService.listPapers(req, classId));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post()
  async createPaper(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.createPaper(req, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Get(':id')
  async getPaper(@Req() req: Request, @Param('id') id: string) {
    try {
      return ok(await this.learningService.getPaper(req, id));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put(':id')
  async updatePaper(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.updatePaper(req, id, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put(':id/structure')
  async saveStructure(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.savePaperStructure(req, id, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post(':id/assets')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir() }))
  async uploadAsset(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      return ok(await this.learningService.uploadPaperAsset(req, id, file));
    } catch (error) {
      throwLearningError(error);
    }
  }
}

@Controller('api/paper-submissions')
export class PaperSubmissionsController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Post('start')
  async start(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.startPaperSubmission(req, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put(':id/answers')
  async saveAnswers(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      await this.learningService.savePaperAnswers(req, id, body);
      return { success: true };
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post(':id/submit')
  async submit(@Req() req: Request, @Param('id') id: string) {
    try {
      return ok(await this.learningService.submitPaper(req, id));
    } catch (error) {
      throwLearningError(error);
    }
  }
}

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get('subjects')
  async getSubjects() {
    try {
      return ok(await this.learningService.listSubjects());
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post('subjects')
  async createSubject(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.createSubject(req, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Get('nodes')
  async getNodes(@Query('subject_id') subjectId?: string) {
    try {
      return ok(await this.learningService.listKnowledgeNodes(subjectId));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post('nodes')
  async createNode(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.createKnowledgeNode(req, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put('nodes/:id')
  async updateNode(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.updateKnowledgeNode(req, id, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Delete('nodes/:id')
  async deleteNode(@Req() req: Request, @Param('id') id: string) {
    try {
      await this.learningService.deleteKnowledgeNode(req, id);
      return { success: true };
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Get('edges')
  async getEdges(@Query('subject_id') subjectId?: string) {
    try {
      return ok(await this.learningService.listKnowledgeEdges(subjectId));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post('edges')
  async createEdge(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.createKnowledgeEdge(req, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Delete('edges/:id')
  async deleteEdge(@Req() req: Request, @Param('id') id: string) {
    try {
      await this.learningService.deleteKnowledgeEdge(req, id);
      return { success: true };
    } catch (error) {
      throwLearningError(error);
    }
  }
}

@Controller('api/wrong-questions')
export class WrongQuestionsController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get('my')
  async my(@Req() req: Request) {
    try {
      return ok(await this.learningService.listWrongQuestions(req));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post(':id/attempt')
  async attempt(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      await this.learningService.attemptWrongQuestion(req, id, body);
      return { success: true };
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post(':id/generate')
  async generate(@Req() req: Request, @Param('id') id: string) {
    try {
      return ok(await this.learningService.generateWrongQuestionPractice(req, id));
    } catch (error) {
      throwLearningError(error);
    }
  }
}

@Controller('api/study-plans')
export class StudyPlansController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get('my')
  async my(@Req() req: Request) {
    try {
      return ok(await this.learningService.getMyStudyPlan(req));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Post()
  async create(@Req() req: Request, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.createStudyPlan(req, body));
    } catch (error) {
      throwLearningError(error);
    }
  }

  @Put('items/:id')
  async updateItem(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    try {
      return ok(await this.learningService.updateStudyPlanItem(req, id, body));
    } catch (error) {
      throwLearningError(error);
    }
  }
}

