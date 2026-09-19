/**
 * portal - feature plugin.
 *
 * The public website surface: homepage sections, articles and the contact form. It owns
 * three legacy-named tables and nothing else.
 *
 * It declares **no** `dependsOn`: nothing in this domain reads students or classes, so
 * depending on `classroom` would only make it fail to start when classroom is absent.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { WebsiteController } from './portal.controllers.js';
import { createPortalRepository } from './portal.repository.js';
import { PortalService } from './portal.service.js';

const providers: Provider[] = [];

let service: PortalService | null = null;

export default definePlugin({
  controllers: [WebsiteController],
  providers,

  async setup(ctx: KernelContext) {
    service = new PortalService(createPortalRepository(ctx.db));
    providers.push({ provide: PortalService, useValue: service });
    ctx.log.info('portal service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
