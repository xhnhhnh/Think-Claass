/**
 * learning - feature plugin.
 *
 * The papers / paper-submissions / knowledge / wrong-questions / study-plans domain: the
 * second and larger half of `api/modules/learning`, after `plugins/assignments` took the
 * Prisma-free assignments+exams half in P4.3b.5b. It serves the 24 routes the frontend
 * already calls (`src/features/learning/api/*`), so `api/modules/learning` can be deleted
 * without a single endpoint changing.
 *
 * What it adopts: the 16 tables of its own schema cluster - papers and their assets,
 * sections, items, answers, submissions and rubric points; the question bank; the knowledge
 * graph; wrong questions and their attempts; study plans and their items. Students are
 * reached only through `classroom.public` (the manifest deliberately declares no read on
 * `students`), which is what makes the ownership check the proof that this plugin never
 * touches another domain's table.
 *
 * Ports: it publishes none. Nothing consumes learning data yet; `insights` reads these
 * tables directly today (recorded in `_known_debt`) and should get a reporting port when
 * that domain migrates.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { createLearningCleanupRule } from './learning.cleanup.js';
import {
  KnowledgeController,
  PaperSubmissionsController,
  PapersController,
  StudyPlansController,
  WrongQuestionsController,
} from './learning.controllers.js';
import { createLearningRepository } from './learning.repository.js';
import { LearningService } from './learning.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest module.
 *
 * `setup()` runs before the module graph exists, so the service cannot be built by a Nest
 * factory and still be the same instance the controllers receive; building it here gives
 * one instance for every request.
 */
const providers: Provider[] = [];

let service: LearningService | null = null;

export default definePlugin({
  controllers: [
    PapersController,
    PaperSubmissionsController,
    KnowledgeController,
    WrongQuestionsController,
    StudyPlansController,
  ],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is missing; `dependsOn` guarantees it is active
    // first. Students are the ONLY classroom-owned data this domain needs.
    const classroom = ctx.use('classroom.public');

    service = new LearningService(createLearningRepository(ctx.db), classroom);
    providers.push({ provide: LearningService, useValue: service });

    ctx.log.info('learning service ready', {
      owns: 'papers, questions, knowledge graph, wrong questions, study plans',
      studentsVia: 'classroom.public',
    });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see learning.cleanup.ts.
    ctx.cleanup.register(createLearningCleanupRule());
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
