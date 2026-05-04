import { SqliteExamsRepository } from './exams.repository.sqlite.js';
import { createExamsRouter } from './exams.routes.js';
import { ExamsService } from './exams.service.js';

export function createExamsModule() {
  return createExamsRouter(new ExamsService(new SqliteExamsRepository()));
}
