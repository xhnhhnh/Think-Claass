/**
 * ai-study's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` erases a teacher, their classes, their students and everything those
 * students own. Each domain deletes its own rows, and the runtime runs every rule inside one
 * transaction; `docs/migration/admin-cascade-decision.md` is the ruling and `plugins/homework`'s rule
 * is the shape this one follows.
 *
 * ## Scope: three anchors, not one
 *
 * A practice set reaches an account three ways, and missing any of them leaves rows behind that name
 * a deleted user:
 *
 *   - `student_id` - the student whose set it is, which is the common case;
 *   - `created_by` - the teacher who dispatched it. A set a deleted teacher assigned to a student who
 *     is *not* being deleted would otherwise survive with a dangling author;
 *   - `class_id` - the class it was dispatched to, covered by the class ids the subject carries.
 *
 * ## Order
 *
 * Answers, then items, then sets - children before parents, by hand. The declared foreign keys would
 * cascade the same way, but only with foreign keys enabled on the connection, and the one operation
 * that erases an account should not depend on a pragma.
 *
 * Every id set is read *inside* the transaction: a sibling rule may already have deleted rows this
 * rule would otherwise select, and a set derived before the transaction began can name rows that are
 * gone.
 */

import type { CleanupRule, DbApi, SqlFragment } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from.
 *
 * All three are declared in `data.tables`, which is what the runtime checks before registering the
 * rule - so "this plugin only erases its own data" is enforced rather than reviewed.
 */
const TABLES = ['p_ai_study_answers', 'p_ai_study_items', 'p_ai_study_sets'];

/** `SELECT id FROM <table> WHERE <predicate>` - "which sets are in scope". */
function setIdsInScope(tx: DbApi, predicate: SqlFragment): number[] {
  return tx
    .query<{ id: number }>(`SELECT id FROM p_ai_study_sets WHERE ${predicate.sql}`, predicate.params)
    .map((row) => row.id);
}

export function createAiStudyCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      // `orAll` answers null in exactly the case every list is empty, which is when there is nothing
      // to delete - so the guard below is a correctness condition, not an optimisation.
      const scope = orAll([
        inList('student_id', subject.studentIds),
        inList('created_by', subject.teacherIds),
        inList('class_id', subject.classIds),
      ]);
      if (!scope) return;

      const setIds = setIdsInScope(tx, scope);
      const setRows = inList('set_id', setIds);
      const idRows = inList('id', setIds);
      if (!setRows || !idRows) return;

      tx.run(`DELETE FROM p_ai_study_answers WHERE ${setRows.sql}`, setRows.params);
      tx.run(`DELETE FROM p_ai_study_items WHERE ${setRows.sql}`, setRows.params);
      tx.run(`DELETE FROM p_ai_study_sets WHERE ${idRows.sql}`, idRows.params);
    },
  };
}
