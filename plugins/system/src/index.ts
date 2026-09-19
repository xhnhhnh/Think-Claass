/**
 * system - feature plugin.
 *
 * The `api/system` surface: question-bank CRUD, `system_settings`, the operation log
 * reader and the whole-database backup export (P4.3b.5).
 *
 * `operation_logs` is *read* here, never written: the kernel's audit sink owns it
 * (`packages/kernel/src/logging/auditLog.ts`, migration `0005_kernel_operation_logs`),
 * so adopting it would claim a write ownership this plugin does not have and cannot
 * honor.
 *
 * It declares no `dependsOn`: nothing here reads students or classes, so depending on
 * `classroom` would only stop it from starting when classroom is absent.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { SystemController } from './system.controller.js';
import { createSystemRepository } from './system.repository.js';
import { SystemService } from './system.service.js';

const providers: Provider[] = [];

let service: SystemService | null = null;

export default definePlugin({
  controllers: [SystemController],
  providers,

  async setup(ctx: KernelContext) {
    service = new SystemService(createSystemRepository(ctx.db));
    providers.push({ provide: SystemService, useValue: service });
    ctx.log.info('system service ready', { owns: ctx.plugin.slug });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
