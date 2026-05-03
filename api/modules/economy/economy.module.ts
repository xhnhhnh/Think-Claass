import { Router } from 'express';

import { SqliteEconomyRepository } from './economy.repository.sqlite.js';
import { EconomyService } from './economy.service.js';
import { createEconomyRouter } from './economy.routes.js';

export interface CreateEconomyModuleOptions {
  service?: EconomyService;
}

export function createEconomyModule(options: CreateEconomyModuleOptions = {}) {
  const router = Router();
  const service = options.service ?? new EconomyService(new SqliteEconomyRepository());

  router.use(createEconomyRouter(service));

  return router;
}

export default createEconomyModule;
