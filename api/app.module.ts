import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ClassroomModule } from './modules/classroom/classroom.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { GameModule } from './modules/game/game.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { LearningModule } from './modules/learning/learning.module.js';
import { MarketplaceModule } from './modules/marketplace/marketplace.module.js';
import { PetModule } from './modules/pet/pet.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SystemModule } from './modules/system/system.module.js';

@Module({
  imports: [
    AdminModule,
    AuthModule,
    ClassroomModule,
    CollaborationModule,
    EngagementModule,
    GameModule,
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
