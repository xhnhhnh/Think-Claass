import { Module } from '@nestjs/common';

import { AnalyticsController } from './insights.controllers.js';
import { InsightsService } from './insights.service.js';

@Module({
  controllers: [AnalyticsController],
  providers: [InsightsService],
})
export class InsightsModule {}
