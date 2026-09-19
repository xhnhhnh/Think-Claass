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
    service = new ParentBuffService(createParentBuffRepository(ctx.db));
    providers.push({ provide: ParentBuffService, useValue: service });
    ctx.log.info('parent-buff service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
