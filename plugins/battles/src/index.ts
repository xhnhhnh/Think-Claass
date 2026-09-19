/**
 * battles - feature plugin.
 *
 * Migrated out of `api/modules/battles/**` in P4.3b.2, following the economy template.
 *
 *   own schema     adopts `class_battles` under its legacy name - the table and column
 *                  names are the JSON contract the frontend reads, and a plugin may only
 *                  *create* `p_battles_` names
 *   HTTP surface   13 routes, two envelope styles, preserved exactly
 *   service port   consumes `classroom.public` for class names, the `enable_class_brawl`
 *                  feature gate, the class search and the shared point ledger
 *
 * The pre-migration repository read classroom's tables four times over (a `classes` JOIN,
 * `classes` for the feature flag, `classes` for the search, and `records JOIN students`
 * for the score). All four are now port calls; the only table left in the repository is
 * `class_battles`.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { BattlesController } from './battles.controllers.js';
import { createBattlesCleanupRule } from './battles.cleanup.js';
import { createBattlesRepository } from './battles.repository.js';
import { BattlesService } from './battles.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest module.
 * `setup()` runs before the module graph exists, so the service instance cannot be
 * produced by a Nest factory and still be wired to the port.
 */
const providers: Provider[] = [];

let service: BattlesService | null = null;

export default definePlugin({
  controllers: [BattlesController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. battles declares it in dependsOn, so the
    // resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new BattlesService(createBattlesRepository(ctx.db), classroom);
    providers.push({ provide: BattlesService, useValue: service });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see battles.cleanup.ts.
    ctx.cleanup.register(createBattlesCleanupRule());

    ctx.log.info('battles service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
