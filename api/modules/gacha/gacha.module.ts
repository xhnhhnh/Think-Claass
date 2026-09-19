import { Module } from '@nestjs/common';

import { GachaController } from './gacha.controllers.js';
import { SqliteGachaRepository } from './gacha.repository.sqlite.js';
import { GachaService } from './gacha.service.js';

@Module({
  controllers: [GachaController],
  providers: [
    {
      provide: GachaService,
      useFactory: () => new GachaService(new SqliteGachaRepository()),
    },
  ],
})
export class GachaModule {}
