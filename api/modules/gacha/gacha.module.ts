import { SqliteGachaRepository } from './gacha.repository.sqlite.js';
import { createGachaRouter } from './gacha.routes.js';
import { GachaService } from './gacha.service.js';

export function createGachaModule() {
  return createGachaRouter(new GachaService(new SqliteGachaRepository()));
}
