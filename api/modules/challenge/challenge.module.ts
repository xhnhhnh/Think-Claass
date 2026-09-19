import { Module } from '@nestjs/common';

import { ChallengeController } from './challenge.controllers.js';
import { SqliteChallengeRepository } from './challenge.repository.sqlite.js';
import { ChallengeService } from './challenge.service.js';

@Module({
  controllers: [ChallengeController],
  providers: [
    {
      provide: ChallengeService,
      useFactory: () => new ChallengeService(new SqliteChallengeRepository()),
    },
  ],
})
export class ChallengeModule {}
