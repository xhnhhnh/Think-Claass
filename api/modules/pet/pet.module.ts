import { Module } from '@nestjs/common';

import { LegacyPetsController, PetController } from './pet.controllers.js';
import { SqlitePetRepository } from './pet.repository.sqlite.js';
import { PetService } from './pet.service.js';

@Module({
  controllers: [LegacyPetsController, PetController],
  providers: [
    {
      provide: PetService,
      useFactory: () => new PetService(new SqlitePetRepository()),
    },
  ],
})
export class PetModule {}
