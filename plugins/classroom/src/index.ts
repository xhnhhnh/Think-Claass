/**
 * classroom - foundation plugin.
 *
 * Owns classes and students, publishes `classroom.public`, and - since P4.3b.6b - also owns
 * the domain's HTTP surface. Until this round the routes still lived in
 * `api/modules/classroom`, which meant the domain was split in two: the plugin served every
 * *other* plugin while the legacy Nest module served the browser.
 *
 *   HTTP surface   six controllers, 47 distinct METHOD+PATH pairs, two controller bases
 *                  (`api/classes` + `api/class`) and a two-path `PUT`, all preserved
 *                  verbatim so `api/modules/classroom` can be deleted with no endpoint
 *                  changing
 *   service port   `classroom.public` is unchanged: pet, economy, challenge and the tests
 *                  keep consuming it byte for byte
 *   one repository the port and the routes share one repository and one feature-flag
 *                  resolver, so "the two implementations agree" is a property of the code
 *                  rather than of review
 *   capability     `classes.enable_*` resolution is assignment-first, column-fallback, via
 *                  `ctx.permissions.assignedTo` - no more `getActiveKernel()` service locator
 *
 * The tables are declared as `adopted` rather than `tables` because they still carry their
 * legacy names. That is a transitional state with a guardrail on it (G10), not a design.
 *
 * The HTTP surface writes a handful of tables this plugin does not own (identity's `users`,
 * collaboration's `peer_reviews`, pet's `pets`, and several tables nobody owns yet). They are
 * enumerated in `classroom.repository.ts` and in the manifest's `_known_debt`; there is no
 * silent path to another domain's data.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import {
  AttendanceController,
  ClassesController,
  GroupsController,
  LeavesController,
  PresetsController,
  StudentsController,
} from './classroom.controllers.js';
import { createClassroomCleanupRule } from './classroom.cleanup.js';
import { createClassFeatureResolver } from './classroom.features.js';
import { createClassroomPort } from './classroom.port.js';
import { createClassroomRepository } from './classroom.repository.js';
import { createReportQueries } from './classroom.reports.js';
import { ClassroomService } from './classroom.service.js';
import { createNameCipher } from './classroom.support.js';

/**
 * Populated during `setup()` and read when the runtime builds the plugin's Nest module.
 *
 * `setup()` runs before the module graph exists, so the service instance cannot be created
 * by Nest's own factory and still be available for `ctx.provide()`. Building it here gives
 * one instance that is both published on the port (through the shared repository) and
 * injected into the six controllers.
 */
const providers: Provider[] = [];

let service: ClassroomService | null = null;

export default definePlugin({
  controllers: [
    StudentsController,
    ClassesController,
    GroupsController,
    PresetsController,
    AttendanceController,
    LeavesController,
  ],
  providers,

  async setup(ctx: KernelContext) {
    const repository = createClassroomRepository(ctx);
    const features = createClassFeatureResolver(ctx, repository);
    // The host injects the decryptor through config (see `KernelConfig.decryptName`);
    // absent means identity, which is right for an unencrypted or test database.
    const cipher = createNameCipher(ctx);

    service = new ClassroomService(repository, features, cipher, ctx);
    providers.push({ provide: ClassroomService, useValue: service });

    ctx.provide(
      'classroom.public',
      createClassroomPort({ ctx, repository, features, cipher, reports: createReportQueries(ctx.db) }),
    );

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see classroom.cleanup.ts.
    ctx.cleanup.register(createClassroomCleanupRule());

    ctx.log.info('classroom port published', {
      service: 'classroom.public',
      decryptedNames: Boolean(ctx.config.decryptName),
      routes: 47,
    });
  },

  async onStop(ctx: KernelContext) {
    service = null;
    providers.length = 0;
    ctx.log.info('classroom plugin stopped');
  },
});
