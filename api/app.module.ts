import { Module } from '@nestjs/common';

/**
 * The legacy composition's module list - now empty, and that is the point.
 *
 * Every domain that used to be a static Nest module here has moved into `plugins/**`, where the
 * plugin runtime assembles it:
 *
 *   GameModule    -> six domain modules (P4.3a) -> plugins/economy, dungeon, gacha, slg,
 *                    battles, challenge (P4.3b.2)
 *   EconomyModule       -> plugins/economy        (P4.3b.1)
 *   CollaborationModule -> plugins/collaboration   (P4.3b.3)
 *   MarketplaceModule   -> plugins/marketplace     (P4.3b.3)
 *   PortalModule        -> plugins/portal          (P4.3b.4)
 *   SettingsModule      -> kernel                  (P5.3c)
 *   SystemModule        -> plugins/system          (P4.3b.5)
 *   PetModule           -> plugins/pet             (P4.3b.6)
 *   ClassroomModule     -> plugins/classroom       (P4.3b.6b)
 *   LearningModule      -> plugins/learning        (P4.3b.6b)
 *   AuthModule          -> plugins/identity        (P4.3b.7)
 *   PlatformModule      -> plugins/payment         (P4.3b.8)
 *   EngagementModule    -> plugins/engagement      (P4.3b.10)
 *   InsightsModule      -> plugins/insights        (P4.3b.13)
 *   AdminModule         -> plugins/admin           (P4.3b.14)  <- the last one
 *
 * The legacy composition still serves all of them: `createLegacyRootModule()` in `api/app.ts`
 * imports the plugin modules into this root, so there is one Nest instance, one not-found handler
 * and the same routes. What is gone is the second way to register a domain - the one that made
 * "this domain is half-migrated" a state the router could be in. Guardrail G11 (route collisions)
 * exists because that state was invisible to everything else.
 *
 * A migrated domain must NOT appear in both places. With this list empty the rule is now structural:
 * there is nowhere left to add one.
 *
 * This module declares no controller of its own: `HealthController` used to live here and its
 * `GET /api/health` was shadowed by the kernel router, which is mounted before Nest in both
 * compositions. It was deleted in P5.3c.
 */
@Module({
  imports: [],
})
export class AppModule {}
