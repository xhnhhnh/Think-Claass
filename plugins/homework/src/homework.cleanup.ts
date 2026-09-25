/**
 * homework's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before the plugin migration the whole cascade was one Prisma transaction that
 * deleted from 58 tables by hard-coded name - atomic, but invisible to every ownership check the
 * runtime enforces. The ruling in `docs/migration/admin-cascade-decision.md` hands each table back to
 * its owner and keeps the atomicity by running the owners' rules in one transaction.
 *
 * This is homework's rule. It is new rather than ported: the legacy cascade predates this domain, so
 * there is no pre-migration statement list to copy and the predicate had to be derived from what the
 * tables actually carry. It mirrors the shape `plugins/assignments` uses for its own tables, with two
 * deliberate differences that are worth stating.
 *
 * ## Why the derivation is `teacher_id OR class_id`, and why `student_id` is separate
 *
 * `p_homework_assignments` carries `teacher_id` (who set the work) and `class_id` (who it is for),
 * and the two are not redundant: a teacher moved off a class still owns the work they created in it,
 * which is the same ownership anchor `plugins/assignments` documents. So an assignment is in scope if
 * either column names something the deleted account owned.
 *
 * A submission, though, hangs off a *student* as well, and the account being deleted may be a
 * student's rather than a teacher's. `subject.studentIds` is what covers that case; without it a
 * deleted pupil would keep their submissions and photos forever, and those rows would be the only
 * trace left of the account.
 *
 * ## Order
 *
 * Children before parents, by hand: `p_homework_photos` and `p_homework_answers` hang off
 * `p_homework_submissions`, which hangs off `p_homework_assignments`; `p_homework_questions` also
 * hangs off the assignment, and `p_homework_qa_messages` off it too. The registry orders rules, not
 * statements within a rule - that is each owner's job, and it is what the pre-migration cascade did
 * by hand. The declared foreign keys would also cascade these, but only if the connection has
 * foreign keys enabled, and the one operation that erases an account should not depend on that.
 *
 * ## Every id set is read inside the transaction
 *
 * The ids are derived with `SELECT` rather than passed in, because a rule runs in the middle of a
 * batch that other rules are concurrently deleting from: a set read before the transaction started
 * can name rows that a sibling rule has already removed, and a set derived too late misses rows.
 */

import type { CleanupRule, DbApi, SqlFragment } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from.
 *
 * Every one is declared in `data.tables`, and the runtime refuses to register a rule naming anything
 * else - which is what makes "it only touches its own data" a checked property rather than a review
 * habit. Exactly one plugin may claim each table, so this list is also the plugin's statement that
 * no one else cleans these up.
 */
const TABLES = [
  'p_homework_photos',
  'p_homework_answers',
  'p_homework_qa_messages',
  'p_homework_submissions',
  'p_homework_questions',
  'p_homework_assignments',
];

/** `SELECT id FROM <table> WHERE <predicate>` - the "which rows are in scope" query. */
function idsOf(tx: DbApi, table: string, predicate: SqlFragment): number[] {
  return tx
    .query<{ id: number }>(`SELECT id FROM ${table} WHERE ${predicate.sql}`, predicate.params)
    .map((row) => row.id);
}

export function createHomeworkCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const teachers = inList('teacher_id', subject.teacherIds);
      const classes = inList('class_id', subject.classIds);
      const students = inList('student_id', subject.studentIds);

      // Assignments in scope: the teacher's own work, or work set for one of their classes.
      const scope = orAll([teachers, classes]);
      const assignmentIds = scope ? idsOf(tx, 'p_homework_assignments', scope) : [];

      // Submissions in scope: those under a scoped assignment, or belonging to a deleted pupil.
      // `orAll` is null in exactly the case both sets are empty, which is when there is nothing to
      // delete - so the `if` is a guard rather than an optimisation.
      const submissions = orAll([inList('assignment_id', assignmentIds), students]);
      const submissionIds = submissions ? idsOf(tx, 'p_homework_submissions', submissions) : [];

      // A pupil's own submissions take their answers and photos with them, so those two are keyed on
      // the submission ids rather than on the assignment ids - the two sets are not the same, and
      // keying them on assignments would miss a student-only deletion entirely.
      const submissionRows = inList('submission_id', submissionIds);
      if (submissionRows) {
        tx.run(`DELETE FROM p_homework_photos WHERE ${submissionRows.sql}`, submissionRows.params);
        tx.run(`DELETE FROM p_homework_answers WHERE ${submissionRows.sql}`, submissionRows.params);
        tx.run(`DELETE FROM p_homework_submissions WHERE ${submissionRows.sql}`, submissionRows.params);
      }

      const assignmentRows = inList('id', assignmentIds);
      if (assignmentRows) {
        tx.run(`DELETE FROM p_homework_questions WHERE ${assignmentRows.sql}`, assignmentRows.params);
        // `p_homework_qa_messages` carries `student_id` as well, so a pupil's thread is deleted when
        // either their assignment goes or they do - the same two-branch shape as the submissions.
        const qaRows = orAll([inList('assignment_id', assignmentIds), students]);
        if (qaRows) tx.run(`DELETE FROM p_homework_qa_messages WHERE ${qaRows.sql}`, qaRows.params);
        tx.run(`DELETE FROM p_homework_assignments WHERE ${assignmentRows.sql}`, assignmentRows.params);
      } else if (students) {
        // No assignments in scope, but possibly still a pupil's own threads - the case of a deleted
        // student whose class no longer holds any of this teacher's homework.
        tx.run(`DELETE FROM p_homework_qa_messages WHERE ${students.sql}`, students.params);
      }
    },
  };
}
