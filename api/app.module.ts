import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClassroomModule } from './modules/classroom/classroom.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { LearningModule } from './modules/learning/learning.module.js';
import { MarketplaceModule } from './modules/marketplace/marketplace.module.js';
import { PetModule } from './modules/pet/pet.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SystemModule } from './modules/system/system.module.js';

/**
 * The legacy composition's module list.
 *
 * This list is now visibly shrinking, which is the whole point of P4.3b:
 *
 *   GameModule    hosted six domains in one file; split apart in P4.3a
 *   EconomyModule       -> plugins/economy      (P4.3b.1)
 *   DungeonModule       -> plugins/dungeon      (P4.3b.2)
 *   GachaModule         -> plugins/gacha        (P4.3b.2)
 *   SlgModule           -> plugins/slg          (P4.3b.2)
 *   BattlesModule       -> plugins/battles      (P4.3b.2)
 *   ChallengeModule     -> plugins/challenge    (P4.3b.2)
 *
 * A migrated domain must NOT appear in both places. Two registrations of the same
 * METHOD+PATH means only the first is reachable and the other is unreachable code;
 * guardrail G11 (routeCollisions) exists to catch exactly that.
 *
 * The legacy composition still serves these domains - it imports the plugin modules
 * into this root via `createLegacyRootModule()` in api/app.ts.
 */
@Module({
  imports: [
    AdminModule,
    AuthModule,
    ClassroomModule,
    CollaborationModule,
    EngagementModule,
    InsightsModule,
    LearningModule,
    MarketplaceModule,
    PetModule,
    PlatformModule,
    PortalModule,
    SettingsModule,
    SystemModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
