/**
 * pet - feature plugin.
 *
 * The reference implementation for a feature-tier plugin. Between this file and its
 * manifest it exercises every extension point the runtime offers:
 *
 *   own schema     migrations/0001_init.sql, applied through the versioned runner
 *                  with table-ownership enforcement
 *   HTTP surface   a Nest controller, assembled at boot into a per-plugin module
 *   service port   publishes `pet.public` for other plugins
 *   events         emits `pet.adopted` / `pet.action.performed`, subscribes to
 *                  `classroom.student.points.changed`
 *   permissions    `pet.adopt`, `pet.interact`, declared in the manifest
 *   collaboration  consumes `classroom.public` instead of touching `students`
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { PetController } from './pet.controllers.js';
import { createPetRepository } from './pet.repository.js';
import { PetService } from './pet.service.js';

/**
 * Populated during `setup()` and read when the runtime builds the plugin's Nest
 * module.
 *
 * `setup()` runs before the module graph exists, so the service instance cannot be
 * created by Nest's own factory and still be available for `ctx.provide()`. Building
 * it here gives one instance that is both published on the port and injected into
 * the controller.
 */
const providers: Provider[] = [];

let service: PetService | null = null;

export default definePlugin({
  controllers: [PetController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is missing. pet declares it in dependsOn, so
    // the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new PetService(createPetRepository(ctx.db), classroom, ctx);
    providers.push({ provide: PetService, useValue: service });

    ctx.provide('pet.public', service.toPort());
    ctx.log.info('pet service ready', { owns: ctx.plugin.slug });
  },

  async onStart(ctx: KernelContext) {
    // Declared in the manifest's `provides.events.subscribes`; the runtime rejects
    // an undeclared subscription rather than silently allowing it.
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
    // Event subscriptions are disposed by the runtime when the plugin stops; this is
    // for plugin-owned resources.
    service = null;
    providers.length = 0;
    ctx.log.info('pet plugin stopped');
  },
});
