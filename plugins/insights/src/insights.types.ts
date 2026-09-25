/**
 * insights row and actor types.
 *
 * The service's own shapes only: everything it reads comes back through a port, so there are no table
 * row types here - which is the whole point of a read model that owns no tables.
 */

/** The caller, as the kernel's request context resolves it. */
export interface ReportActor {
  id: number | null;
  role: string | null;
  /**
   * The student row this login owns, and the class it is in.
   *
   * Filled in by the host's scope resolver (`api/app.ts` `resolveActorScope`) for students and
   * parents; absent when the composition installs no resolver, in which case the service resolves
   * the same facts through `classroom.public` before answering a class-scoped report.
   */
  studentId?: number;
  classId?: number;
}
