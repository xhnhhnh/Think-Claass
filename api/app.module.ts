import { Module } from '@nestjs/common';
import { AdminModule } from './modules/admin/admin.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

/**
 * The legacy composition's module list.
 *
 * This list is visibly shrinking, which is the point of P4.3b:
 *
 *   GameModule    hosted six domains in one file; split apart in P4.3a
 *   EconomyModule       -> plugins/economy      (P4.3b.1)
 *   DungeonModule       -> plugins/dungeon      (P4.3b.2)
 *   GachaModule         -> plugins/gacha        (P4.3b.2)
 *   SlgModule           -> plugins/slg          (P4.3b.2)
 *   BattlesModule       -> plugins/battles      (P4.3b.2)
 *   ChallengeModule     -> plugins/challenge    (P4.3b.2)
 *   CollaborationModule -> plugins/collaboration (P4.3b.3)
 *   MarketplaceModule   -> plugins/marketplace   (P4.3b.3)
 *   PortalModule        -> plugins/portal        (P4.3b.4)
 *   SettingsModule      -> kernel               (P5.3c)
 *   SystemModule        -> plugins/system        (P4.3b.5)
 *   PetModule           -> plugins/pet           (P4.3b.6)
 *   ClassroomModule     -> plugins/classroom     (P4.3b.6b) - the whole HTTP surface,
 *                          47 METHOD+PATH pairs over six controllers, ported verbatim
 *   LearningModule      -> plugins/learning      (P4.3b.6b) - papers / knowledge /
 *                          wrong-questions / study-plans, the 24 routes left after
 *                          plugins/assignments took the assignments+exams half
 *   AuthModule          -> plugins/identity      (P4.3b.7) - login / profile / register /
 *                          activate over `users` + the activation ledger, which also took
 *                          api/services/activationService.ts with it
 *
 * After P4.3b.7 this list is down to four modules, and every one of them is a domain the
 * migration has not reached yet (admin, engagement, insights, and the payment half of platform).
 *
 * `SettingsModule` is the one entry that did not become a plugin: its entire body
 * was `SELECT key, value FROM settings`, and `settings` is kernel-owned storage, so
 * the route now lives in `packages/kernel/src/http/kernelRoutes.ts` and is reachable
 * even in a kernel-only boot.
 *
 * A migrated domain must NOT appear in both places. Two registrations of the same
 * METHOD+PATH means only the first is reachable and the other is unreachable code;
 * guardrail G11 (routeCollisions) exists to catch exactly that.
 *
 * The legacy composition still serves these domains - it imports the plugin modules
 * into this root via `createLegacyRootModule()` in api/app.ts.
 *
 * This module declares no controller of its own: `HealthController` used to live here
 * and its `GET /api/health` was shadowed by the kernel router, which is mounted before
 * Nest in both compositions. That made the controller unreachable code *and* a route
 * collision (G11) that the snapshot could not show, because a set comparison ignores
 * duplicates. The kernel's richer health body was the one actually served, so the
 * controller was deleted in P5.3c.
 */
@Module({
  imports: [
    AdminModule,
    EngagementModule,
    InsightsModule,
    PlatformModule,
  ],
})
export class AppModule {}
