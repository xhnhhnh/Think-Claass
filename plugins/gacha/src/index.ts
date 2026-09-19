/**
 * gacha - feature plugin.
 *
 * Second small domain migrated out of `api/modules/**` (P4.3b), following the
 * economy template. What it exercises that economy did not:
 *
 *   own schema     adopts three pre-existing tables (pet_dictionary, gacha_pools,
 *                  student_pets) rather than creating them - a plugin migration may
 *                  only touch `p_<slug>_` names, and renaming these would change both
 *                  the JSON the frontend reads and the tables admin's delete cascade
 *                  targets by name
 *   HTTP surface   10 routes, two envelope styles, preserved exactly
 *   service port   consumes `classroom.public` for the student balance, the feature
 *                  gate (`enable_gacha`) and the shared point ledger
 *   money path     the pre-migration `draw()` wrote `students.available_points` and
 *                  inserted into `records` inside one transaction; it now debits via
 *                  `transferStudentCredits`, appends via `recordStudentLedgerEntry`,
 *                  and refunds the debit if the pet write fails
 *
 * The random source is injectable (`GachaService`'s third constructor argument) so the
 * rarity roll is deterministic in tests, exactly as before.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { GachaController } from './gacha.controllers.js';
import { createGachaCleanupRule } from './gacha.cleanup.js';
import { createGachaRepository } from './gacha.repository.js';
import { GachaService } from './gacha.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: GachaService | null = null;

export default definePlugin({
  controllers: [GachaController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. gacha declares it in dependsOn,
    // so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new GachaService(createGachaRepository(ctx.db), classroom);
    providers.push({ provide: GachaService, useValue: service });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see gacha.cleanup.ts.
    ctx.cleanup.register(createGachaCleanupRule());

    ctx.log.info('gacha service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
