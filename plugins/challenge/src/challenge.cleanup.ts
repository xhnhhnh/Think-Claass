/**
 * challenge's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * One statement, ported verbatim from `admin.repository.ts` line 460:
 * `challenge_records.deleteMany({ student_id: { in: studentIds } })`, one of the statements the
 * cascade ran inside `if (studentIds.length)` (lines 457-478). `inList` returns `null` for an empty
 * student set, which is that guard: `IN ()` is a syntax error, and "no students" must not become
 * "every row".
 *
 * `world_bosses`, the plugin's other adopted table, is not here because the pre-migration cascade
 * never deleted it - a boss belongs to a class activity, not to the deleted account.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['challenge_records'];

export function createChallengeCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const students = inList('student_id', subject.studentIds);
      if (students) {
        tx.run(`DELETE FROM challenge_records WHERE ${students.sql}`, students.params);
      }
    },
  };
}
