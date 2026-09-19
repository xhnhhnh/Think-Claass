import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BattlesModule } from './modules/battles/battles.module.js';
import { ChallengeModule } from './modules/challenge/challenge.module.js';
import { ClassroomModule } from './modules/classroom/classroom.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { DungeonModule } from './modules/dungeon/dungeon.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { GachaModule } from './modules/gacha/gacha.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { LearningModule } from './modules/learning/learning.module.js';
import { MarketplaceModule } from './modules/marketplace/marketplace.module.js';
import { PetModule } from './modules/pet/pet.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SlgModule } from './modules/slg/slg.module.js';
import { SystemModule } from './modules/system/system.module.js';

/**
 * The legacy composition's module list.
 *
 * `GameModule` used to appear here and internally hosted six independent domains
 * (challenge, economy, dungeon, gacha, battles, slg) in one file and one module.
 * Each now has its own module and its own controller file; `modules/game` is gone.
 *
 * `EconomyModule` is gone too: economy moved to `plugins/economy` in P4.3b, and the
 * legacy composition mounts plugin modules by importing `host.modules` into this root
 * (see `createLegacyRootModule()` in api/app.ts). The domain must NOT exist in both
 * places at once - that would serve the same 20 routes twice, and only the first
 * registration would be reachable (guardrail G11).
 */
@Module({
  imports: [
    AdminModule,
    AuthModule,
    BattlesModule,
    ChallengeModule,
    ClassroomModule,
    CollaborationModule,
    DungeonModule,
    EngagementModule,
    GachaModule,
    InsightsModule,
    LearningModule,
    MarketplaceModule,
    PetModule,
    PlatformModule,
    PortalModule,
    SettingsModule,
    SlgModule,
    SystemModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
