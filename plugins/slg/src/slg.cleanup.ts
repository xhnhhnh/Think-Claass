/**
 * slg's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * Two statements, ported verbatim from `admin.repository.ts`, both inside the pre-migration
 * `if (classIds.length)` block (lines 508-529):
 *
 *   class_resources `deleteMany({ class_id: { in: classIds } })` line 523
 *   territories     `deleteMany({ class_id: { in: classIds } })` line 526
 *
 * Both tables belong to a class rather than to a student, so a teacher with no classes deletes
 * nothing here - which is what `inList` returning `null` expresses, and why the statement is
 * skipped rather than run with an empty `IN ()`.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['class_resources', 'territories'];

export function createSlgCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const classes = inList('class_id', subject.classIds);
      if (classes) {
        tx.run(`DELETE FROM class_resources WHERE ${classes.sql}`, classes.params);
        tx.run(`DELETE FROM territories WHERE ${classes.sql}`, classes.params);
      }
    },
  };
}
