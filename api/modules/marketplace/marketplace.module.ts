import { Module } from '@nestjs/common';

import { MarketplaceController } from './marketplace.controllers.js';
import { MarketplaceService } from './marketplace.service.js';

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
