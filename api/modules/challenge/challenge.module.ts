import { Router } from 'express';

import { SqliteChallengeRepository } from './challenge.repository.sqlite.js';
import { ChallengeService } from './challenge.service.js';
import { createChallengeRouter } from './challenge.routes.js';

export interface CreateChallengeModuleOptions {
  service?: ChallengeService;
}

export function createChallengeModule(options: CreateChallengeModuleOptions = {}) {
  const router = Router();
  const service = options.service ?? new ChallengeService(new SqliteChallengeRepository());

  router.use(createChallengeRouter(service));

  return router;
}

export default createChallengeModule;
