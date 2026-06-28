import { Module } from '@nestjs/common';

import { WebsiteController } from './portal.controllers.js';
import { PortalService } from './portal.service.js';

@Module({
  controllers: [WebsiteController],
  providers: [PortalService],
})
export class PortalModule {}
