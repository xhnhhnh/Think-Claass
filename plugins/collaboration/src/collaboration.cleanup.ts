/**
 * collaboration's account-deletion cleanup rule.
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
 * ## `peer_reviews` is matched through a table this plugin does not own
 *
 * The pre-migration cascade deleted a peer review when its `assignment_id` was in the assignment
 * ids derived from `teacher_id = teacherId OR class_id IN classIds` (lines 217-225, 392-399).
 * `assignments` belongs to `plugins/assignments`, so this plugin declares it as a **read**
 * (`data.reads`) and derives the ids with `SELECT id FROM assignments` inside the same transaction.
 * This is the dependency the decision doc calls out in section 7.3: the ids must still exist when
 * this rule runs, and `peer_reviews.assignment_id -> assignments.id` is the foreign key that makes
 * the registry order this rule before the assignments rule. If that order were wrong the derived
 * set would be empty and the reviews would be orphaned.
 *
 * A peer review reachable *only* through `team_quest_id` is not matched by any of those three
 * branches, so it stays behind - exactly what the pre-migration cascade did. The column carries no
 * foreign key, so leaving it does not fail the transaction; changing the predicate would change
 * which rows are deleted, which this port deliberately does not do.
 *
 * ## Order inside this rule
 *
 * Children before parents: `student_task_nodes.node_id -> task_nodes.id` and
 * `team_quest_progress.quest_id -> team_quests.id`. The registry orders *rules*; ordering within one
 * owner's set of tables is the owner's job, and is what the pre-migration cascade did by hand.
 */

import type { CleanupRule, DbApi, SqlFragment } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['peer_reviews', 'student_task_nodes', 'task_nodes', 'team_quest_progress', 'team_quests'];

/** `SELECT id FROM <table> WHERE <predicate>` - one pre-migration `findMany({ select: { id } })`. */
function idsOf(tx: DbApi, table: string, predicate: SqlFragment): number[] {
  return tx
    .query<{ id: number }>(`SELECT id FROM ${table} WHERE ${predicate.sql}`, predicate.params)
    .map((row) => row.id);
}

export function createCollaborationCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const teachers = inList('teacher_id', subject.teacherIds);
      const classes = inList('class_id', subject.classIds);
      const students = inList('student_id', subject.studentIds);

      // assignmentIds: `assignments` where `teacher_id = teacherId OR class_id IN classIds`
      // (lines 217-225), read from the assignments plugin's table - see the header.
      const assignmentScope = orAll([teachers, classes]);
      const assignmentIds = assignmentScope ? idsOf(tx, 'assignments', assignmentScope) : [];

      // peer_reviews: `if (assignmentIds.length || studentIds.length)` -> `deleteMany({ OR:
      // [assignment_id IN assignmentIds, reviewer_id IN studentIds, reviewee_id IN studentIds] })`
      // (lines 392-399). `orAll` is null in exactly the case the guard skipped.
      const peerReviews = orAll([
        inList('assignment_id', assignmentIds),
        inList('reviewer_id', subject.studentIds),
        inList('reviewee_id', subject.studentIds),
      ]);
      if (peerReviews) {
        tx.run(`DELETE FROM peer_reviews WHERE ${peerReviews.sql}`, peerReviews.params);
      }

      // student_task_nodes: `deleteMany({ student_id: { in: studentIds } })`, inside the
      // `studentIds.length` block (line 474).
      if (students) {
        tx.run(`DELETE FROM student_task_nodes WHERE ${students.sql}`, students.params);
      }

      // task_nodes: `deleteMany({ class_id: { in: classIds } })`, inside the `classIds.length`
      // block (line 536). A teacher with no classes owns no task-tree nodes, which is what the
      // pre-migration guard said.
      if (classes) {
        tx.run(`DELETE FROM task_nodes WHERE ${classes.sql}`, classes.params);
      }

      // teamQuestIds: `team_quests` where `teacher_id = teacherId OR class_id IN classIds`
      // (lines 234-241).
      const questScope = orAll([teachers, classes]);
      const teamQuestIds = questScope ? idsOf(tx, 'team_quests', questScope) : [];

      // team_quest_progress: `if (teamQuestIds.length || studentIds.length)` -> `deleteMany({ OR:
      // [quest_id IN teamQuestIds, student_id IN studentIds] })` (lines 419-428).
      const teamQuestProgress = orAll([inList('quest_id', teamQuestIds), students]);
      if (teamQuestProgress) {
        tx.run(`DELETE FROM team_quest_progress WHERE ${teamQuestProgress.sql}`, teamQuestProgress.params);
      }

      // team_quests: only when the derived set is non-empty (lines 429-431).
      const teamQuestRows = inList('id', teamQuestIds);
      if (teamQuestRows) {
        tx.run(`DELETE FROM team_quests WHERE ${teamQuestRows.sql}`, teamQuestRows.params);
      }
    },
  };
}
