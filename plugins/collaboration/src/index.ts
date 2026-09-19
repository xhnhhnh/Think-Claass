/**
 * collaboration - feature plugin.
 *
 * Migrated out of `api/modules/collaboration/**` (P4.3b.3), following the economy
 * template.
 *
 *   own schema     adopts five pre-existing tables (`task_nodes`, `student_task_nodes`,
 *                  `team_quests`, `team_quest_progress`, `peer_reviews`) rather than
 *                  renaming them: a plugin migration may only create
 *                  `p_collaboration_` names, and `SELECT *` rows for `task_nodes` /
 *                  `team_quests` go straight through to the frontend
 *   shared reads   `student_groups` is read (never written) for the group names on the
 *                  team-quest progress aggregate; classroom's group surface owns it -
 *                  see the manifest's `_reads_note`
 *   shared access  `students` (roster, group membership), the `enable_task_tree` flag
 *                  and the shared point ledger all arrive through `classroom.public`
 *   HTTP surface   16 routes across three controllers, envelopes preserved exactly
 *
 * The pre-migration service wrote `students.total_points`/`available_points` and
 * inserted into `records` directly. Both now go through the port, because a second
 * writer would make classroom's ownership of those tables meaningless.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { createCollaborationCleanupRule } from './collaboration.cleanup.js';
import { PeerReviewsController, TaskTreeController, TeamQuestsController } from './collaboration.controllers.js';
import { createCollaborationRepository } from './collaboration.repository.js';
import { CollaborationService } from './collaboration.service.js';

/**
 * Populated during `setup()` and read when the runtime builds this plugin's Nest
 * module. `setup()` runs before the module graph exists, so the service instance
 * cannot be produced by a Nest factory and still be published on a port.
 */
const providers: Provider[] = [];

let service: CollaborationService | null = null;

export default definePlugin({
  controllers: [TaskTreeController, TeamQuestsController, PeerReviewsController],
  providers,

  async setup(ctx: KernelContext) {
    // `ctx.use` throws when classroom is absent. collaboration declares it in
    // dependsOn, so the resolver guarantees it is active before this runs.
    const classroom = ctx.use('classroom.public');

    service = new CollaborationService(createCollaborationRepository(ctx.db), classroom);
    providers.push({ provide: CollaborationService, useValue: service });

    ctx.log.info('collaboration service ready', { owns: ctx.plugin.slug });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; the peer-review branch derives assignment ids
    // from plugins/assignments' table, which is why that FK order matters - see
    // collaboration.cleanup.ts.
    ctx.cleanup.register(createCollaborationCleanupRule());
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
