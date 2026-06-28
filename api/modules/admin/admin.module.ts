import { Module } from '@nestjs/common';

import { AdminController, AuditLogsController, OpenApiController } from './admin.controllers.js';
import { SqliteAdminMaintenanceService } from './admin.maintenance.js';
import { PrismaAdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';
import { AuditLogsService } from './auditLogs.service.js';
import { OpenApiService } from './openapi.service.js';
import { AdminUpdateController, ReleaseUpdateService } from './admin.update.js';

@Module({
  controllers: [AdminController, AdminUpdateController, AuditLogsController, OpenApiController],
  providers: [
    {
      provide: AdminService,
      useFactory: () => new AdminService(new PrismaAdminRepository(), new SqliteAdminMaintenanceService()),
    },
    AuditLogsService,
    OpenApiService,
    ReleaseUpdateService,
  ],
})
export class AdminModule {}
