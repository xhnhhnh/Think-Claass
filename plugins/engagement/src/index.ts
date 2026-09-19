/**
 * Engagement plugin - announcements, praises, certificates, redemption, messages, family tasks,
 * lucky draw and danmaku.
 *
 * Relocated from `api/modules/engagement/**`. HANDOFF section 8.9 listed two blockers for this
 * domain; one is resolved and one is made explicit:
 *
 *   - **the `pets` write is gone.** `createPraise` used to `UPDATE pets SET experience, level,
 *     attack_power, mood` from a module that does not own that table - a cross-plugin write no
 *     `data.reads` declaration could describe. It is now `pet.public.grantPetExperience`, and the
 *     growth formula stays in the plugin that owns it.
 *   - **`redemption_tickets` is still written by two plugins.** Marketplace issues tickets for shop
 *     purchases; this domain issues them as lucky-draw prizes and verifies both. That is the
 *     `SHARED_WRITE_TABLES` exception the guardrail already records, and this manifest declares the
 *     table rather than pretending otherwise. Fixing it properly means a marketplace port and that
 *     domain's migration; recorded in `_known_debt` instead of quietly resolved in this direction.
 *
 * Ports are resolved lazily for the optional ones. `pet` is optional in practice because a praise
 * must be recorded even on a deployment where the pet domain is disabled; `identity` is optional
 * because the lucky-draw config falls back to teacher id 1, which is what the pre-migration code
 * did when no teacher row existed.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import {
  AnnouncementsController,
  CertificatesController,
  ClassAnnouncementsController,
  DanmakuController,
  FamilyTasksController,
  LuckyDrawController,
  MessagesController,
  PraisesController,
  RedemptionController,
} from './engagement.controllers.js';
import { createEngagementCleanupRule } from './engagement.cleanup.js';
import { createEngagementRepository } from './engagement.repository.js';
import { EngagementService } from './engagement.service.js';

const providers: Provider[] = [];

let service: EngagementService | null = null;

export default definePlugin({
  controllers: [
    AnnouncementsController,
    ClassAnnouncementsController,
    PraisesController,
    CertificatesController,
    RedemptionController,
    MessagesController,
    FamilyTasksController,
    LuckyDrawController,
    DanmakuController,
  ],
  providers,

  async setup(ctx: KernelContext) {
    const classroom = ctx.use('classroom.public');

    const instance = new EngagementService({
      ctx,
      repository: createEngagementRepository(ctx.db),
      classroom,
      // Both lazy, for the reasons in the header.
      identity: () => ctx.tryUse('identity.public'),
      pet: () => ctx.tryUse('pet.public'),
    });

    service = instance;
    providers.push({ provide: EngagementService, useValue: instance });

    /**
     * The published port - three praise reads and nothing else.
     *
     * The insights read model needs a praise count for a class, a count for a student, and the newest
     * five snippets for the student report. Those are the only reads of this domain from outside, so
     * the port publishes exactly them rather than a general "query praises" surface - a wider port
     * would make this plugin's storage shape a contract for consumers that do not exist.
     *
     * Resolved lazily by the consumer (`insights` treats it as optional), so a deployment with
     * engagement disabled still renders reports, with the praise half at zero.
     */
    ctx.provide('engagement.public', {
      async countPraisesForStudent(studentId) {
        return instance.countPraisesForStudent(studentId);
      },
      async countPraisesForClass(classId) {
        return instance.countPraisesForClass(classId);
      },
      async listPraiseSnippetsForStudent(studentId, limit) {
        return instance.listPraiseSnippets(studentId, limit);
      },
    });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see engagement.cleanup.ts.
    ctx.cleanup.register(createEngagementCleanupRule());

    ctx.log.info('engagement service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
