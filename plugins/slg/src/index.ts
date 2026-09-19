/**
 * slg - feature plugin.
 *
 * Migrated out of `api/modules/slg/**` in P4.3b, following the economy template. It is
 * the first *small* domain to move, and the one that proves the shared point ledger
 * write is routable: the pre-migration repository inserted into `records` directly and
 * wrote `students.available_points` itself, and both now go through `classroom.public`.
 *
 *   own schema     adopts two pre-existing tables (territories, class_resources) rather
 *                  than creating them - a plugin migration may only touch `p_<slug>_`
 *                  names, and `SELECT *` rows are the JSON the frontend reads
 *   HTTP surface   8 routes, two envelope styles, preserved exactly
 *   service port   consumes `classroom.public` for the student balance, the feature gate
 *                  and the shared point ledger
 *   feature gate   `enable_slg`, resolved by classroom, never by importing api/**
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { SlgController } from './slg.controllers.js';
import { createSlgCleanupRule } from './slg.cleanup.js';
import { createSlgRepository } from './slg.repository.js';
import { SlgService } from './slg.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: SlgService | null = null;

export default definePlugin({
  controllers: [SlgController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. slg declares it in dependsOn,
    // so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new SlgService(createSlgRepository(ctx.db), classroom);
    providers.push({ provide: SlgService, useValue: service });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see slg.cleanup.ts.
    ctx.cleanup.register(createSlgCleanupRule());

    ctx.log.info('slg service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
