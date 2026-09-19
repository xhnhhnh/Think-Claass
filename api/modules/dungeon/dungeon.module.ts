import { Module } from '@nestjs/common';

import { DungeonController } from './dungeon.controllers.js';
import { SqliteDungeonRepository } from './dungeon.repository.sqlite.js';
import { DungeonService } from './dungeon.service.js';

@Module({
  controllers: [DungeonController],
  providers: [
    {
      provide: DungeonService,
      useFactory: () => new DungeonService(new SqliteDungeonRepository()),
    },
  ],
})
export class DungeonModule {}
