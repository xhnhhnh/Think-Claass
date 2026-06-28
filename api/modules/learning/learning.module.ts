import { Module } from '@nestjs/common';
import { SqliteAssignmentsRepository } from './assignments.repository.sqlite.js';
import { AssignmentsService } from './assignments.service.js';
import { SqliteExamsRepository } from './exams.repository.sqlite.js';
import { ExamsService } from './exams.service.js';
import {
  AssignmentsController,
  ExamsController,
  KnowledgeController,
  PaperSubmissionsController,
  PapersController,
  StudyPlansController,
  WrongQuestionsController,
} from './learning.controllers.js';
import { LearningService } from './learning.service.js';

@Module({
  controllers: [
    AssignmentsController,
    ExamsController,
    KnowledgeController,
    PaperSubmissionsController,
    PapersController,
    StudyPlansController,
    WrongQuestionsController,
  ],
  providers: [
    LearningService,
    {
      provide: AssignmentsService,
      useFactory: () => new AssignmentsService(new SqliteAssignmentsRepository()),
    },
    {
      provide: ExamsService,
      useFactory: () => new ExamsService(new SqliteExamsRepository()),
    },
  ],
})
export class LearningModule {}

