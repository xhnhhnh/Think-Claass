import { SqliteBattlesRepository } from './battles.repository.sqlite.js';
import { createBattlesRouter } from './battles.routes.js';
import { BattlesService } from './battles.service.js';

export function createBattlesModule() {
  return createBattlesRouter(new BattlesService(new SqliteBattlesRepository()));
}
