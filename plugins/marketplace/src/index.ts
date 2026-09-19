/**
 * marketplace - feature plugin.
 *
 * The points shop, its auctions and its blind boxes, migrated out of
 * `api/modules/marketplace/**` following the economy/gacha template. What it exercises
 * that those did not:
 *
 *   own schema     adopts four pre-existing tables (auctions, blind_boxes, shop_items,
 *                  redemption_tickets) rather than creating them - a plugin migration
 *                  may only touch `p_<slug>_` names, the rows are the JSON the frontend
 *                  reads, and admin.repository.ts still deletes two of them by name
 *   HTTP surface   16 routes on `/api/shop`, all `{ success, ...payload }`, preserved
 *                  exactly, including the six POST routes that answer 200 not 201
 *   service port   consumes `classroom.public` for the student balance, the feature
 *                  gates (`enable_shop`, `enable_auction_blind_box`) and the shared
 *                  point ledger
 *   balance rule   spends and refunds move `available_points` only
 *                  (`transferStudentCredits`), while the blind-box consolation moves
 *                  BOTH balances (`adjustPoints`) because that is what the
 *                  pre-migration `addStudentPoints` did - see the service header
 *
 * The repository never sees `students`, `classes` or `records`: `listItems` used to
 * join the first two and the money paths wrote the other two, and all of them now go
 * through the port.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { MarketplaceController } from './marketplace.controllers.js';
import { createMarketplaceCleanupRule } from './marketplace.cleanup.js';
import { createMarketplaceRepository } from './marketplace.repository.js';
import { MarketplaceService } from './marketplace.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: MarketplaceService | null = null;

export default definePlugin({
  controllers: [MarketplaceController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. marketplace declares it in
    // dependsOn, so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new MarketplaceService(createMarketplaceRepository(ctx.db), classroom);
    providers.push({ provide: MarketplaceService, useValue: service });

    ctx.log.info('marketplace service ready', { owns: ctx.plugin.slug });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys. This is also the single cleanup owner of the
    // shared-write table `redemption_tickets`; see marketplace.cleanup.ts.
    ctx.cleanup.register(createMarketplaceCleanupRule());
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
