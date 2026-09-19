import { Module } from '@nestjs/common';
import {
  KnowledgeController,
  PaperSubmissionsController,
  PapersController,
  StudyPlansController,
  WrongQuestionsController,
} from './learning.controllers.js';
import { LearningService } from './learning.service.js';

/**
 * The paper/knowledge engine: papers, paper submissions, the knowledge graph, wrong
 * questions and study plans.
 *
 * The assignments and exams halves left this module in P4.3b.5b, when they became
 * `plugins/assignments`. They were the only Prisma-free part of the domain, so they could
 * move on their own; what remains here is the 28-model Prisma engine, which is its own
 * round.
 */
@Module({
  controllers: [
    KnowledgeController,
    PaperSubmissionsController,
    PapersController,
    StudyPlansController,
    WrongQuestionsController,
  ],
  providers: [LearningService],
})
export class LearningModule {}
