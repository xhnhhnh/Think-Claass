/**
 * economy - feature plugin.
 *
 * The first domain migrated out of `api/modules/**` (P4.3b). It exercises the paths
 * every later domain will need, which is why it went first:
 *
 *   own schema     adopts three pre-existing tables (bank_accounts, stocks,
 *                  student_stocks) rather than creating them - a plugin migration may
 *                  only touch `p_<slug>_` names, and renaming these would change the
 *                  JSON the frontend reads
 *   HTTP surface   20 routes, two envelope styles, preserved exactly
 *   service port   consumes `classroom.public` for the student balance, the feature
 *                  gate and the shared point ledger
 *   feature gate   `enable_economy`, resolved by classroom, never by importing api/**
 *
 * The pre-migration service wrote `students.available_points` and `records` directly.
 * Both now go through the port, because a second writer would make classroom's
 * ownership of those tables meaningless.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { createEconomyCleanupRule } from './economy.cleanup.js';
import { EconomyController } from './economy.controllers.js';
import { createEconomyRepository } from './economy.repository.js';
import { EconomyService } from './economy.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: EconomyService | null = null;

export default definePlugin({
  controllers: [EconomyController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. economy declares it in dependsOn,
    // so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new EconomyService(createEconomyRepository(ctx.db), classroom);
    providers.push({ provide: EconomyService, useValue: service });

    ctx.log.info('economy service ready', { owns: ctx.plugin.slug });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see economy.cleanup.ts.
    ctx.cleanup.register(createEconomyCleanupRule());
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
