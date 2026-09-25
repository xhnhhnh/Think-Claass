/**
 * homework - the homework system, as a feature plugin.
 *
 * A teacher publishes an assignment built from interactive questions, a student answers them or
 * photographs their paper, and the teacher grades it. AI grading and an AI Q&A thread hang off the
 * same rows.
 *
 * The domain is new rather than adopted, which is why this plugin owns six `p_homework_*` tables and
 * adopts nothing: the legacy `assignments` surface it replaces had one text box and one score, and
 * every part of a real question model - types, options, per-question marks, photo evidence, a
 * per-answer split between what the AI proposed and what the teacher decided - had nowhere to live.
 * `plugins/assignments` keeps serving its own routes until it is retired; nothing new should be built
 * against it.
 *
 * What this plugin demonstrates, all of it on real data:
 *
 *   HTTP surface   one Nest controller, 16 actor-guarded routes
 *   migrations     the schema is `plugins/homework/migrations/0001_init.sql`, registered as the
 *                  application migration `0001_homework_tables` - see plugin.json's
 *                  `_migrations_note` for why it is registered there rather than by the plugin
 *                  runtime's own runner
 *   cleanup        one account-deletion rule over all six tables, so erasing a teacher or a pupil
 *                  takes their homework, submissions, answers, photos and AI threads with it
 *   collaboration  student names come through the host's `config.decryptName`; the class roster is
 *                  read from `students`, declared under `data.reads`
 *   AI             a provider port with a deterministic mock by default and an OpenAI-compatible
 *                  implementation that is off unless configured - see homework.ai.ts. The same
 *                  provider is published as `homework.public`, which is how the admin console reads
 *                  its state and tests the connection without knowing the settings' vocabulary, and
 *                  how `plugins/ai-study` borrows one completion to re-rank its candidates
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { createHomeworkCleanupRule } from './homework.cleanup.js';
import { HomeworkController } from './homework.controllers.js';
import { createHomeworkRepository } from './homework.repository.js';
import { HomeworkService } from './homework.service.js';

/**
 * Populated during `setup()` and read when the runtime builds the plugin's Nest module.
 *
 * `setup()` runs before the module graph exists, so the service instance cannot be created by Nest's
 * own factory and still be available to `ctx.provide()`. Building it here gives one instance that is
 * both injected into the controller and reachable from anywhere else that later asks for it.
 */
const providers: Provider[] = [];

let homeworkService: HomeworkService | null = null;

export default definePlugin({
  controllers: [HomeworkController],
  providers,

  async setup(ctx: KernelContext) {
    // Same injection point the classroom and assignments plugins use: student names are encrypted at
    // rest and the key belongs to the application, so the host hands its decryptor over rather than a
    // plugin re-implementing the cipher. An absent decryptor means identity, which is what the
    // classroom port falls back to as well.
    const decryptName = ctx.config.decryptName;

    homeworkService = new HomeworkService({
      repository: createHomeworkRepository(ctx.db, decryptName ? { decryptName } : {}),
      ...(decryptName ? { decryptName } : {}),
      // Deliberately NOT `ctx.settings.get(...)`: the AI configuration is platform-level policy the
      // operator edits in the admin console, and `getPlatform` is the read-only accessor for
      // exactly that. Passing the accessor itself (rather than resolved values) is what lets the
      // provider pick up a changed key without a restart - see `HomeworkService.ai()`.
      settings: ctx.settings,
    });

    // Bound to this instance rather than read back off the module variable: `onStop` nulls that
    // variable, and a port method that closed over it would answer "not loaded" for a stopped
    // plugin while the console is still rendering its panel.
    const service = homeworkService;

    providers.push({ provide: HomeworkService, useValue: service });

    // The console's AI panel reaches the provider through this port rather than through the `ai_*`
    // settings, so `plugins/admin` never has to know what a provider is and this plugin never has to
    // expose its settings vocabulary. The implementation is the service methods verbatim: a port that
    // re-implemented them would be a second copy of the resolution rule, which is the thing it exists
    // to avoid.
    //
    // `complete` is the same arrangement for a *different* consumer: `plugins/ai-study` borrows the
    // configured model to re-rank practice candidates. It is one model call with the caller's own
    // prompt, so nothing about 智学 enters this plugin - only "which model, with which key, for how
    // long", which is exactly what the settings in the console configure.
    ctx.provide('homework.public', {
      getAiState: () => service.getAiState(),
      testAiConnection: () => service.testAiConnection(),
      complete: (request) => service.completeFor(request),
    });

    // Account deletion: this plugin deletes its own rows when a teacher or student account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see homework.cleanup.ts.
    ctx.cleanup.register(createHomeworkCleanupRule());

    ctx.log.info('homework service ready', {
      owns: ctx.plugin.slug,
      decryptedNames: Boolean(decryptName),
      port: 'homework.public',
    });
  },

  async onStop(ctx: KernelContext) {
    homeworkService = null;
    providers.length = 0;
    ctx.log.info('homework plugin stopped');
  },
});
