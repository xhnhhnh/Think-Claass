/**
 * parent-buff's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * One statement, ported verbatim from `admin.repository.ts` line 468:
 * `parent_activity.deleteMany({ student_id: { in: studentIds } })`, one of the statements the
 * cascade ran inside `if (studentIds.length)` (lines 457-478).
 *
 * Note what this covers: `parent_activity` holds both the blessing rows and the parent-login rows
 * this plugin writes through `parent_buff.public.touchParentLogin` (see the manifest's
 * `_adopted_note`), and the pre-migration predicate filtered by neither - it deleted every row of a
 * deleted student, of either kind. That is preserved here; `inList` returning `null` is the
 * pre-migration `studentIds.length` guard, not a new condition.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['parent_activity'];

export function createParentBuffCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const students = inList('student_id', subject.studentIds);
      if (students) {
        tx.run(`DELETE FROM parent_activity WHERE ${students.sql}`, students.params);
      }
    },
  };
}
