import { Module } from '@nestjs/common';

import { PeerReviewsController, TaskTreeController, TeamQuestsController } from './collaboration.controllers.js';
import { CollaborationService } from './collaboration.service.js';

@Module({
  controllers: [PeerReviewsController, TaskTreeController, TeamQuestsController],
  providers: [CollaborationService],
})
export class CollaborationModule {}
