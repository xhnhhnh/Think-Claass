import { Module } from '@nestjs/common';

import { ParentBuffController, PaymentController } from './platform.controllers.js';
import { PlatformService } from './platform.service.js';

@Module({
  controllers: [ParentBuffController, PaymentController],
  providers: [PlatformService],
})
export class PlatformModule {}
