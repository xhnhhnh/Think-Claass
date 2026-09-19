/**
 * assignments - feature plugin.
 *
 * The `api/assignments` + `api/exams` surface (14 routes), lifted out of the
 * `api/modules/learning` god-module as the first slice of that domain (P4.3b.5b). These two
 * services were the only part of learning that never touched Prisma - they are plain
 * SQLite over four tables - which is what makes them a clean fragment to move on their
 * own; the paper/knowledge engine (28 Prisma models) is a later round.
 *
 * Adopts `assignments` and `exams` (the two parents) and their child tables
 * `student_assignments` / `student_exams`, so all four stay with their legacy names until
 * the P7 namespace migration. It reads `students` - and only reads it - to expand a class
 * into one grade row per pupil when an exam is created, and to label the grade sheet with
 * names; that column is AES-encrypted, so the host's decryptor is injected.
 *
 * It declares no `dependsOn`: the port would buy nothing here, because the two things it
 * needs from classroom (`the ids of a class's students`, `a student's decrypted name`) are
 * a plain read of a table it already declares. Depending on classroom would only stop this
 * plugin from starting when classroom is absent.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { AssignmentsController, ExamsController } from './assignments.controllers.js';
import { createAssignmentsRepository, createExamsRepository } from './assignments.repository.js';
import { AssignmentsService, ExamsService } from './assignments.service.js';

const providers: Provider[] = [];

let assignmentsService: AssignmentsService | null = null;
let examsService: ExamsService | null = null;

export default definePlugin({
  controllers: [AssignmentsController, ExamsController],
  providers,

  async setup(ctx: KernelContext) {
    // Same injection point the classroom plugin uses: names are encrypted at rest and the
    // key belongs to the application, so the host hands its decryptor over rather than a
    // plugin re-implementing the cipher. Absent decryptor means identity, which is what
    // the classroom port falls back to as well.
    const decryptName = ctx.config.decryptName;

    assignmentsService = new AssignmentsService(createAssignmentsRepository(ctx.db));
    examsService = new ExamsService(createExamsRepository(ctx.db, decryptName ? { decryptName } : {}));

    providers.push({ provide: AssignmentsService, useValue: assignmentsService });
    providers.push({ provide: ExamsService, useValue: examsService });

    ctx.log.info('assignments service ready', {
      owns: ctx.plugin.slug,
      decryptedNames: Boolean(decryptName),
    });
  },

  async onStop() {
    assignmentsService = null;
    examsService = null;
    providers.length = 0;
  },
});
