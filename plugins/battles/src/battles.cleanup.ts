/**
 * battles' account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * One statement, ported verbatim from `admin.repository.ts` lines 514-522, inside the pre-migration
 * `if (classIds.length)` block:
 *
 *   class_battles `deleteMany({ OR: [initiator_class_id IN classIds,
 *                                    target_class_id IN classIds,
 *                                    winner_class_id IN classIds] })`
 *
 * A battle between two classes the teacher owns must go whichever side of the row names them, so
 * all three columns are checked - and `winner_class_id` is NULL until a battle ends, which `IN`
 * never matches, exactly as in the Prisma predicate. `orAll` returns null when the class set is
 * empty, preserving the pre-migration guard.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['class_battles'];

export function createBattlesCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const sides = orAll([
        inList('initiator_class_id', subject.classIds),
        inList('target_class_id', subject.classIds),
        inList('winner_class_id', subject.classIds),
      ]);
      if (sides) {
        tx.run(`DELETE FROM class_battles WHERE ${sides.sql}`, sides.params);
      }
    },
  };
}
