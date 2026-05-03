import { SqliteDungeonRepository } from './dungeon.repository.sqlite.js';
import { createDungeonRouter } from './dungeon.routes.js';
import { DungeonService } from './dungeon.service.js';

export function createDungeonModule() {
  return createDungeonRouter(new DungeonService(new SqliteDungeonRepository()));
}
