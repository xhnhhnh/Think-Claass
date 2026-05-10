import { SqliteSlgRepository } from './slg.repository.sqlite.js';
import { createSlgRouter } from './slg.routes.js';
import { SlgService } from './slg.service.js';

export function createSlgModule() {
  return createSlgRouter(new SlgService(new SqliteSlgRepository()));
}
