import { Module } from '@nestjs/common';

import { SlgController } from './slg.controllers.js';
import { SqliteSlgRepository } from './slg.repository.sqlite.js';
import { SlgService } from './slg.service.js';

@Module({
  controllers: [SlgController],
  providers: [
    {
      provide: SlgService,
      useFactory: () => new SlgService(new SqliteSlgRepository()),
    },
  ],
})
export class SlgModule {}
