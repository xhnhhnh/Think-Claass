/**
 * gacha's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * Two statements, ported verbatim from `admin.repository.ts`:
 *
 *   gacha_pools  `deleteMany({ class_id: { in: classIds } })`   line 525, inside `if (classIds.length)`
 *   student_pets `deleteMany({ student_id: { in: studentIds } })` line 473, inside `if (studentIds.length)`
 *
 * `pet_dictionary` - the third table this plugin adopts - is deliberately absent: the pre-migration
 * cascade never deleted from it, because it is a shared rarity/cost dictionary rather than anything
 * a student owns. `inList` returning `null` is the pre-migration guard for both statements.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['gacha_pools', 'student_pets'];

export function createGachaCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const classes = inList('class_id', subject.classIds);
      if (classes) {
        tx.run(`DELETE FROM gacha_pools WHERE ${classes.sql}`, classes.params);
      }

      const students = inList('student_id', subject.studentIds);
      if (students) {
        tx.run(`DELETE FROM student_pets WHERE ${students.sql}`, students.params);
      }
    },
  };
}
