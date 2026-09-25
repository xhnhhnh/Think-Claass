/**
 * ai-study - the 智学 personalisation plugin.
 *
 * What this plugin is, in one line: a student asks for today's practice set, a deterministic rule
 * picks it out of the question bank and says why each question is there, the student answers it, and
 * submitting folds the result back into their 错题本 - with an optional model allowed to reorder the
 * rule's choices and rewrite its reasons, and nothing else.
 *
 * What it demonstrates, all on real data:
 *
 *   HTTP surface   two Nest controllers, six actor-guarded routes
 *   migrations     three `p_ai_study_*` tables, applied by the plugin runtime's own runner - see
 *                  plugin.json `_migrations_note` for why this one registers its DDL in the manifest
 *                  rather than in `api/schema/appMigrations.ts` (the opposite of `plugins/homework`,
 *                  and structural rather than stylistic)
 *   ports          consumes two (`classroom.public`, `learning.public`) and publishes none
 *   permissions    three declared capabilities, enforced per route with `ctx.permissions.require`
 *   AI             borrowed, not owned: `homework.public.complete` resolved per call through
 *                  `ctx.tryUse`, so an installation without the homework plugin still gets the full
 *                  rule-based feature and a message explaining what is missing
 *   cleanup        one account-deletion rule over its three tables
 *
 * ## Why the ports are resolved where they are
 *
 * `classroom` and `learning` are hard dependencies (`dependsOn`), so `ctx.use` is safe in `setup()`:
 * a deployment without a question bank has no personalisation to compute and should not activate this
 * plugin at all.
 *
 * `homework` is the opposite and is handled the opposite way. It is `required: false` and sorts
 * *after* this plugin, so a value captured during `setup()` would be `null` for the life of the
 * process - the trap `plugins/insights` and `plugins/payment` both record. The closure below is
 * therefore resolved per request, and `null` means "no model is installed here", which the engine
 * layer reports as `ai.available: false` rather than as a failure.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { AiStudyAuthorization } from './ai-study.authorization.js';
import { createAiStudyCleanupRule } from './ai-study.cleanup.js';
import { AiStudyStudentController, AiStudyTeacherController } from './ai-study.controllers.js';
import { createAiStudyRepository } from './ai-study.repository.js';
import { AiStudyService } from './ai-study.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest module.
 *
 * `setup()` runs before the module graph exists, so the service cannot be built by a Nest factory and
 * still be the same instance the controllers receive.
 */
const providers: Provider[] = [];

let service: AiStudyService | null = null;

export default definePlugin({
  controllers: [AiStudyStudentController, AiStudyTeacherController],
  providers,

  async setup(ctx: KernelContext) {
    const classroom = ctx.use('classroom.public');
    const learning = ctx.use('learning.public');

    const instance = new AiStudyService({
      repository: createAiStudyRepository(ctx.db),
      classroom,
      learning,
      authorization: new AiStudyAuthorization(classroom),
      // A function, not the resolved port: see the file header.
      aiProvider: () => ctx.tryUse('homework.public'),
    });

    service = instance;
    providers.push({ provide: AiStudyService, useValue: instance });

    ctx.cleanup.register(createAiStudyCleanupRule());

    ctx.log.info('ai-study service ready', {
      owns: ctx.plugin.slug,
      facts: 'learning.public',
      people: 'classroom.public',
      model: 'homework.public (optional, resolved per call)',
    });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
