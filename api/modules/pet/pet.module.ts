import { Router } from 'express';

import { PetService } from './pet.service.js';
import { SqlitePetRepository } from './pet.repository.sqlite.js';
import { createPetRouter } from './pet.routes.js';

export interface CreatePetModuleOptions {
  service?: PetService;
}

export function createPetModule(options: CreatePetModuleOptions = {}) {
  const router = Router();
  const service = options.service ?? new PetService(new SqlitePetRepository());

  router.use(createPetRouter(service));

  return router;
}

export default createPetModule;
