/**
 * insights plugin - the reporting read model.
 *
 * Relocated from `api/modules/insights/**` (P4.3b.13). Three read-only routes over twelve tables,
 * **none of which this plugin owns**: the report ports published by `classroom` in P4.3b.12 carry
 * eight of them (including the four that belong to `plugins/assignments`), and `engagement.public`
 * carries `praises`.
 *
 * `data.adopted` and `data.reads` are therefore both empty, which is a design statement rather than a
 * placeholder: a read model that declares no data cannot drift into owning some. The ownership check
 * in `ctx.db` then has nothing to permit - this plugin never touches a table directly.
 *
 * `dependsOn: classroom` is hard: every route resolves a student or a class through it. `engagement`
 * is deliberately **not** a dependency - it is a feature plugin that may be disabled, and a
 * deployment without it must still render reports, with the praise half at zero. That is why the
 * port is resolved lazily at call time (the trap HANDOFF section 9 records: capturing
 * `ctx.tryUse()` in `setup()` freezes it as `null`, because plugins are set up in slug order).
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { AnalyticsController } from './insights.controllers.js';
import { InsightsService } from './insights.service.js';

const providers: Provider[] = [];

let service: InsightsService | null = null;

export default definePlugin({
  controllers: [AnalyticsController],
  providers,

  async setup(ctx: KernelContext) {
    const instance = new InsightsService({
      ctx,
      classroom: ctx.use('classroom.public'),
      // A function, not the resolved port: `insights` sorts before neither plugin matters, but the
      // registry is a live map and `engagement` may be disabled entirely.
      engagement: () => ctx.tryUse('engagement.public'),
    });

    service = instance;
    providers.push({ provide: InsightsService, useValue: instance });

    ctx.log.info('insights service ready', { owns: ctx.plugin.slug, ownsTables: 0 });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
