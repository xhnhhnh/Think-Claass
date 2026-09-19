import { Module } from '@nestjs/common';

import { EconomyController } from './economy.controllers.js';
import { SqliteEconomyRepository } from './economy.repository.sqlite.js';
import { EconomyService } from './economy.service.js';

@Module({
  controllers: [EconomyController],
  providers: [
    {
      provide: EconomyService,
      useFactory: () => new EconomyService(new SqliteEconomyRepository()),
    },
  ],
})
export class EconomyModule {}
