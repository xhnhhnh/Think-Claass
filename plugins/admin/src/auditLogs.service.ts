/**
 * The console's audit-log viewer.
 *
 * Read-only over `operation_logs`, which the kernel's audit sink owns (migration
 * `0005_kernel_operation_logs`) and which this plugin declares in `data.reads`. The pre-migration
 * service read it through `api/db.ts`'s own connection; the statement and the pagination are
 * unchanged.
 *
 * Writing is a different door: entries this plugin produces go through `ctx.audit.record`, inside
 * the transaction they describe.
 */

import type { AdminRepository, AuditLogQuery } from './admin.types.js';

export class AuditLogsService {
  constructor(private readonly repository: AdminRepository) {}

  listLogs(query: AuditLogQuery) {
    return this.repository.listAuditLogs(query);
  }
}
