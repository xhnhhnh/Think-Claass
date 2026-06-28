import { Module } from '@nestjs/common';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

@Module({
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
