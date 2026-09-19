/**
 * pet - the real pet domain, as a plugin.
 *
 * This plugin started life in P3 as a reference implementation on invented tables
 * (`p_pet_pets`, with `name`/`element`/`stage` columns that no part of the product ever had).
 * P4.3b.6 makes it the actual domain: it adopts the legacy `pets` table and serves the 17
 * routes the frontend already calls, so `api/modules/pet` can be deleted - which is what
 * removes the last route collision in the tree (G11).
 *
 * What it demonstrates now, all of it on real data:
 *
 *   HTTP surface   two Nest controllers, assembled at boot into a per-plugin module
 *   service port   publishes `pet.public` for other plugins (`getBattleProfile` exists so the
 *                  challenge domain can stop reading `pets.attack_power` directly)
 *   events         emits `pet.adopted` / `pet.action.performed`, subscribes to
 *                  `classroom.student.points.changed`
 *   permissions    `pet.adopt`, `pet.interact`, enforced on this plugin's own alias routes
 *   collaboration  students, the point ledger and the class feature flags come through
 *                  `classroom.public`; only `pets` is read or written locally
 *   migrations     the versioned runner, including retiring its own invented tables
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { LegacyPetsController, PetController } from './pet.controllers.js';
import { createPetCleanupRule } from './pet.cleanup.js';
import { createPetRepository } from './pet.repository.js';
import { PetService } from './pet.service.js';

/**
 * Populated during `setup()` and read when the runtime builds the plugin's Nest module.
 *
 * `setup()` runs before the module graph exists, so the service instance cannot be created by
 * Nest's own factory and still be available for `ctx.provide()`. Building it here gives one
 * instance that is both published on the port and injected into the controllers.
 */
const providers: Provider[] = [];

let service: PetService | null = null;

export default definePlugin({
  controllers: [PetController, LegacyPetsController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is missing. pet declares it in dependsOn, so the
    // resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new PetService(createPetRepository(ctx.db), classroom, ctx);
    providers.push({ provide: PetService, useValue: service });

    ctx.provide('pet.public', service.toPort());

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see pet.cleanup.ts.
    ctx.cleanup.register(createPetCleanupRule());

    ctx.log.info('pet service ready', { owns: 'pets (adopted)', reads: ['praises', 'parent_activity'] });
  },

  async onStart(ctx: KernelContext) {
    // Declared in the manifest's `provides.events.subscribes`; the runtime rejects an
    // undeclared subscription rather than silently allowing it. The reaction is a log line
    // because the pet domain has no rule that depends on a points change - the subscription
    // is here to keep that relationship visible rather than implied.
    ctx.events.on('classroom.student.points.changed', (payload) => {
      ctx.log.debug('student points changed', {
        studentId: payload.studentId,
        delta: payload.delta,
        reason: payload.reason,
      });
    });

    ctx.log.info('pet plugin started');
  },

  async onStop(ctx: KernelContext) {
    // Event subscriptions are disposed by the runtime when the plugin stops; this is for
    // plugin-owned resources.
    service = null;
    providers.length = 0;
    ctx.log.info('pet plugin stopped');
  },
});
