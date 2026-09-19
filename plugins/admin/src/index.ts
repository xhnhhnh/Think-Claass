/**
 * admin - the console domain, and the last one to leave `api/modules/**`.
 *
 * This plugin closes P4.3b. Before it, `api/modules/admin` was the only remaining Nest module, and
 * `admin.repository.ts` was the only write path in the system that bypassed the plugin runtime: it
 * reached `users`, `classes`, `students`, ten more domains' tables and the kernel's `operation_logs`
 * through Prisma, so no ownership check could see it.
 *
 * What replaced it:
 *
 *   teachers / activation codes / superadmins   `identity.public`    (identity owns `users`)
 *   the classes and students a deletion covers  `classroom.public`   (classroom owns both)
 *   the database file                           `ctx.maintenance`    (the host owns the connection)
 *   the audit trail                             `ctx.audit`          (the kernel owns the table)
 *   the 58-table delete cascade                 `ctx.cleanup`        (each plugin deletes its own)
 *   announcements, api_keys, schools            this plugin's own tables
 *
 * The cascade is the interesting one, and the reason `docs/migration/admin-cascade-decision.md`
 * exists: it keeps the single transaction that makes a half-deleted account impossible, while every
 * table is still deleted by the plugin that owns it. `admin.service.deleteTeacher` resolves the
 * account's scope through the two domain owners and hands it to `ctx.cleanup.run()`, which runs all
 * registered rules inside one transaction ordered by the schema's foreign keys.
 *
 * Debt this plugin still carries is recorded in `plugin.json` (`_known_debt`): the database
 * maintenance operations are the host's, the self-updater imports `node:child_process` directly
 * because the capability requires a `worker` isolation level that arrives in P6, and the audit-log
 * viewer reads `operation_logs` (declared, read-only) because the kernel's audit sink publishes a
 * writer, not a query surface.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { AdminController, AuditLogsController, OpenApiController } from './admin.controllers.js';
import { SqliteAdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';
import { AdminUpdateController, ReleaseUpdateService } from './admin.update.js';
import { AuditLogsService } from './auditLogs.service.js';
import { OpenApiService } from './openapi.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest module.
 *
 * Same pattern as `plugins/classroom`: the service has to exist before the module graph does, so it
 * is constructed here and then handed to Nest as a value provider.
 */
const providers: Provider[] = [];

export default definePlugin({
  controllers: [AdminController, AdminUpdateController, AuditLogsController, OpenApiController],
  providers,

  async setup(ctx: KernelContext) {
    const repository = new SqliteAdminRepository({ ctx });

    const service = new AdminService({
      ctx,
      repository,
      // Resolved per call, never captured: `admin` sorts before `classroom` and `identity`
      // alphabetically, so a value read here would be `undefined` for the life of the process
      // (HANDOFF section 9 records this trap). `dependsOn` guarantees both exist.
      identity: () => ctx.use('identity.public'),
      classroom: () => ctx.use('classroom.public'),
    });

    providers.push(
      { provide: AdminService, useValue: service },
      { provide: OpenApiService, useValue: new OpenApiService(repository) },
      { provide: AuditLogsService, useValue: new AuditLogsService(repository) },
      { provide: ReleaseUpdateService, useValue: new ReleaseUpdateService() },
    );

    ctx.log.info('admin service ready', {
      owns: ['announcements', 'api_keys', 'schools'],
      routes: 28,
      cascade: 'ctx.cleanup',
    });
  },

  async onStop(ctx: KernelContext) {
    providers.length = 0;
    ctx.log.info('admin plugin stopped');
  },
});
