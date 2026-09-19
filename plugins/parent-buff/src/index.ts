/**
 * Parent-buff plugin.
 *
 * The `POST /api/parent-buff` route, split out of `api/modules/platform` (P4.3b.5d).
 *
 * `platform` held two unrelated things: a parent-blessing action that writes one row to
 * `parent_activity`, and three payment routes that are payment *infrastructure*
 * (`api/services/paymentService.ts`, `api/services/paymentProviders/**`). Moving the pair
 * together would have dragged that infrastructure into a feature plugin, which is the
 * "migrate infrastructure as if it were a domain" mistake §9 of the handoff warns about -
 * so only the business half moves here and `/api/payment/*` stays where it is for now.
 *
 * No `dependsOn`: the row it writes references a student, but nothing here reads students or
 * classes - the foreign key is the database's business, not a port's.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { ParentBuffController } from './parentBuff.controller.js';
import { createParentBuffRepository } from './parentBuff.repository.js';
import { ParentBuffService } from './parentBuff.service.js';

const providers: Provider[] = [];

let service: ParentBuffService | null = null;

export default definePlugin({
  controllers: [ParentBuffController],
  providers,

  async setup(ctx: KernelContext) {
    const instance = new ParentBuffService(createParentBuffRepository(ctx.db));
    service = instance;
    providers.push({ provide: ParentBuffService, useValue: instance });

    /**
     * The published port, delayed until here so it can close over the service instance
     * rather than over the module-level `service` variable (which `onStop` clears).
     *
     * The name carries an underscore because the service registry requires the first segment to
     * be exactly this plugin's derived slug - `slugOf('parent-buff')` is `parent_buff` - and
     * `serviceRegistry.provide` throws otherwise.
     *
     * One method on purpose: this plugin owns `parent_activity`, and the identity domain needs
     * exactly one operation on it - the parent-login activity upsert that
     * `api/modules/auth/auth.service.ts` used to perform through Prisma. Publishing
     * `createParentBuff` as well would invite a second HTTP path for a route that already
     * exists.
     */
    ctx.provide('parent_buff.public', {
      async touchParentLogin(parentId, studentId, day) {
        instance.touchParentLogin(parentId, studentId, day);
      },
    });

    ctx.log.info('parent-buff service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
