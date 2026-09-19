/**
 * dungeon - feature plugin.
 *
 * Migrated out of `api/modules/dungeon/**` in P4.3b, following the economy template:
 *
 *   own schema     adopts the pre-existing `dungeon_runs` table rather than creating
 *                  it - a plugin migration may only create `p_<slug>_` names, and
 *                  renaming it would change the JSON the frontend reads
 *   HTTP surface   8 routes in two envelope styles, preserved exactly
 *   service port   consumes `classroom.public` for the `enable_dungeon` gate, the
 *                  spendable point balance and the shared `records` ledger
 *
 * The pre-migration service wrote `students.available_points` and `records` directly.
 * Both now go through the port, because a second writer would make classroom's
 * ownership of those tables meaningless.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { DungeonController } from './dungeon.controllers.js';
import { createDungeonCleanupRule } from './dungeon.cleanup.js';
import { createDungeonRepository } from './dungeon.repository.js';
import { DungeonService } from './dungeon.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: DungeonService | null = null;

export default definePlugin({
  controllers: [DungeonController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. dungeon declares it in dependsOn,
    // so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new DungeonService(createDungeonRepository(ctx.db), classroom);
    providers.push({ provide: DungeonService, useValue: service });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see dungeon.cleanup.ts.
    ctx.cleanup.register(createDungeonCleanupRule());

    ctx.log.info('dungeon service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
