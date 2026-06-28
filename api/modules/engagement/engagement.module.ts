import { Module } from '@nestjs/common';
import {
  AnnouncementsController,
  CertificatesController,
  ClassAnnouncementsController,
  DanmakuController,
  FamilyTasksController,
  LuckyDrawController,
  MessagesController,
  PraisesController,
  RedemptionController,
} from './engagement.controllers.js';
import { EngagementService } from './engagement.service.js';

@Module({
  controllers: [
    AnnouncementsController,
    CertificatesController,
    ClassAnnouncementsController,
    DanmakuController,
    FamilyTasksController,
    LuckyDrawController,
    MessagesController,
    PraisesController,
    RedemptionController,
  ],
  providers: [EngagementService],
})
export class EngagementModule {}
