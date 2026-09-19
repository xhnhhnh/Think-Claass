/**
 * assignments' account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * This file is one of those rules. Its statements are the pre-migration ones, ported verbatim from
 * `admin.repository.ts` (the pre-migration line numbers are cited per block below) - the point is
 * *who* deletes, not *what* is deleted.
 *
 * ## The two id sets are derived, not given
 *
 * `CleanupSubject` names the teacher, their classes, their students and their logins - not
 * assignments or exams. The pre-migration cascade derived both from the same predicate,
 * `teacher_id = teacherId OR class_id IN classIds` (lines 217-233), and this rule repeats that
 * derivation with `SELECT id FROM ...`: the ids must be read *inside* the same transaction, because
 * a rule runs in the middle of a batch that other rules are also deleting from.
 *
 * Only the child rows matched by `student_id` are not derived: they come straight from
 * `subject.studentIds`, which is why a student in one of the teacher's classes loses their grade
 * rows even for an assignment the teacher did not create.
 *
 * ## Order inside this rule
 *
 * Children before parents: `student_assignments.assignment_id -> assignments.id` and
 * `student_exams.exam_id -> exams.id`. The registry orders *rules*; ordering within one owner's set
 * of tables is the owner's job, and is what the pre-migration cascade did by hand.
 */

import type { CleanupRule, DbApi, SqlFragment } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['student_assignments', 'assignments', 'student_exams', 'exams'];

/** `SELECT id FROM <table> WHERE <predicate>` - one pre-migration `findMany({ select: { id } })`. */
function idsOf(tx: DbApi, table: string, predicate: SqlFragment): number[] {
  return tx
    .query<{ id: number }>(`SELECT id FROM ${table} WHERE ${predicate.sql}`, predicate.params)
    .map((row) => row.id);
}

export function createAssignmentsCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const teachers = inList('teacher_id', subject.teacherIds);
      const classes = inList('class_id', subject.classIds);
      const students = inList('student_id', subject.studentIds);

      // assignments / exams, both derived with `OR: [{ teacher_id }, ...(classIds.length ?
      // [{ class_id: { in: classIds } }] : [])]` (lines 217-233). The pre-migration code ran both
      // queries unconditionally, and `teacherIds` always holds the account being deleted, so the
      // predicate is never empty; `orAll` still drops the class branch when there are no classes,
      // exactly as the spread did.
      const scope = orAll([teachers, classes]);
      const assignmentIds = scope ? idsOf(tx, 'assignments', scope) : [];
      const examIds = scope ? idsOf(tx, 'exams', scope) : [];

      // student_assignments: `if (assignmentIds.length || studentIds.length)` ->
      // `deleteMany({ OR: [assignment_id IN assignmentIds, student_id IN studentIds] })`
      // (lines 383-391). `orAll` is null in exactly the case the guard skipped.
      const studentAssignments = orAll([inList('assignment_id', assignmentIds), students]);
      if (studentAssignments) {
        tx.run(`DELETE FROM student_assignments WHERE ${studentAssignments.sql}`, studentAssignments.params);
      }

      // assignments: only when the derived set is non-empty (lines 401-403).
      const assignmentRows = inList('id', assignmentIds);
      if (assignmentRows) {
        tx.run(`DELETE FROM assignments WHERE ${assignmentRows.sql}`, assignmentRows.params);
      }

      // student_exams: same shape (lines 405-413).
      const studentExams = orAll([inList('exam_id', examIds), students]);
      if (studentExams) {
        tx.run(`DELETE FROM student_exams WHERE ${studentExams.sql}`, studentExams.params);
      }

      // exams: only when the derived set is non-empty (lines 415-417).
      const examRows = inList('id', examIds);
      if (examRows) {
        tx.run(`DELETE FROM exams WHERE ${examRows.sql}`, examRows.params);
      }
    },
  };
}
