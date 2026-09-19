/**
 * challenge - feature plugin.
 *
 * Migrated out of `api/modules/challenge/**` (P4.3b), following the economy template.
 *
 *   own schema     adopts `challenge_records` and `world_bosses`, its two legacy
 *                  tables, rather than renaming them (a plugin migration may only
 *                  create `p_<slug>_` names, and `world_bosses` rows are returned
 *                  straight through to the frontend)
 *   shared reads   `question_bank` (authored by the system domain) is declared in
 *                  `data.reads` - read-only, and transitional: it should become a port
 *                  once its owner publishes one
 *   service port   consumes `classroom.public` for student lookups, the class roster,
 *                  the feature gates, point awards and the shared ledger, and
 *                  `pet.public` (optionally) for the boss damage roll
 *   HTTP surface   14 routes, two envelope styles, preserved exactly
 *
 * The pre-migration service wrote `students.total_points` / `students.available_points`
 * and inserted into `records` directly. Both now go through the port, because a second
 * writer would make classroom's ownership of those tables meaningless.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { ChallengeController } from './challenge.controllers.js';
import { createChallengeRepository } from './challenge.repository.js';
import { ChallengeService } from './challenge.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: ChallengeService | null = null;

export default definePlugin({
  controllers: [ChallengeController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. challenge declares it in dependsOn,
    // so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new ChallengeService(createChallengeRepository(ctx.db), classroom, () =>
      // Resolved per call, never captured here: plugins are set up in slug order, so `pet`
      // does not exist yet while `challenge` is initialising. Capturing the result of
      // `tryUse` in setup() silently pins this dependency to "absent" - measured, not guessed.
      ctx.tryUse('pet.public'),
    );
    providers.push({ provide: ChallengeService, useValue: service });

    ctx.log.info('challenge service ready', { owns: ctx.plugin.slug, petDamage: 'pet.public (lazy)' });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
