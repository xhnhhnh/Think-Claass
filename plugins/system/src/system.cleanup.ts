/**
 * system's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * One statement, ported verbatim from `admin.repository.ts` line 550:
 * `question_bank.deleteMany({ teacher_id: teacherId })`, which the cascade ran unconditionally
 * rather than inside one of its class/student guards - the question bank belongs to the teacher, so
 * it goes even when the teacher has neither classes nor students.
 *
 * A teacher id set is always non-empty for this rule, so the `inList` guard never drops the
 * statement in practice; it is there because `IN ()` must not be emittable.
 *
 * `system_settings`, the plugin's other adopted table, is not here: the pre-migration cascade never
 * deleted it (the ruling records that `system_settings` still has two writers and leaves the
 * ownership question to the round that migrates admin's settings routes).
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['question_bank'];

export function createSystemCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const teachers = inList('teacher_id', subject.teacherIds);
      if (teachers) {
        tx.run(`DELETE FROM question_bank WHERE ${teachers.sql}`, teachers.params);
      }
    },
  };
}
