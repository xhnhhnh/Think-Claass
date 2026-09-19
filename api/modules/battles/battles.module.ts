import { Module } from '@nestjs/common';

import { BattlesController } from './battles.controllers.js';
import { SqliteBattlesRepository } from './battles.repository.sqlite.js';
import { BattlesService } from './battles.service.js';

@Module({
  controllers: [BattlesController],
  providers: [
    {
      provide: BattlesService,
      useFactory: () => new BattlesService(new SqliteBattlesRepository()),
    },
  ],
})
export class BattlesModule {}
