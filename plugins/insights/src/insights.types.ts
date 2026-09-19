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
}
