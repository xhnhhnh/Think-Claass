import { SqliteAssignmentsRepository } from './assignments.repository.sqlite.js';
import { createAssignmentsRouter } from './assignments.routes.js';
import { AssignmentsService } from './assignments.service.js';

export function createAssignmentsModule() {
  return createAssignmentsRouter(new AssignmentsService(new SqliteAssignmentsRepository()));
}
