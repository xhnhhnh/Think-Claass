/**
 * engagement's account-deletion cleanup rule.
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
 * ## The two `else` branches
 *
 * Two of the pre-migration statements had a second form for the case where the teacher had no
 * classes (`class_announcements`, line 509-513 with its `else` at 528) or no students (`praises`,
 * 498-502 with its `else` at 505). Both second forms are special cases of the first with the empty
 * branch dropped, which is exactly what `orAll` produces for a `null` fragment - so
 * `OR(teacher_id = ?, class_id IN (...))` and `OR(teacher_id = ?, student_id IN (...))` cover both
 * branches without a conditional, and delete the same rows either way. That is an equivalence, not
 * a simplification.
 *
 * ## `announcements` is not here
 *
 * It used to be declared as adopted by this plugin, but admin is the only writer (create / update /
 * delete all go through `admin.repository.ts`, and this plugin only runs
 * `SELECT * FROM announcements WHERE is_active = 1`), and the pre-migration cascade never listed it
 * among the 58 tables it deleted. The ruling (§4.4) moves the ownership to `plugins/admin`; this
 * manifest now declares it in `data.reads`, which is what this plugin actually does with it.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = [
  'certificates',
  'class_announcements',
  'danmaku_messages',
  'family_tasks',
  'lucky_draw_config',
  'messages',
  'praises',
  'user_achievements',
];

export function createEngagementCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const teachers = inList('teacher_id', subject.teacherIds);
      const classes = inList('class_id', subject.classIds);
      const students = inList('student_id', subject.studentIds);

      // certificates (:459), family_tasks (:462) and user_achievements (:475): three of the
      // statements the pre-migration cascade ran inside `if (studentIds.length)` (lines 457-478),
      // i.e. never for a teacher who had no students. `inList` returning null is that branch.
      if (students) {
        tx.run(`DELETE FROM certificates WHERE ${students.sql}`, students.params);
        tx.run(`DELETE FROM family_tasks WHERE ${students.sql}`, students.params);
        tx.run(`DELETE FROM user_achievements WHERE ${students.sql}`, students.params);
      }

      // messages: `OR(receiver_id IN studentIds, class_id IN classIds)` inside
      // `if (studentIds.length || classIds.length)` (lines 480-488). `orAll` returns null when both
      // sets are empty, which is the statement's own guard - the pre-migration code had no `else`
      // here, so nothing ran for a teacher with neither.
      const receivers = inList('receiver_id', subject.studentIds);
      const messageFeed = orAll([receivers, classes]);
      if (messageFeed) {
        tx.run(`DELETE FROM messages WHERE ${messageFeed.sql}`, messageFeed.params);
      }

      // praises: `OR(teacher_id = teacherId, student_id IN studentIds)` (lines 498-502), with the
      // `teacher_id`-only form at 505 as its empty-students case.
      const praisePredicate = orAll([teachers, students]);
      if (praisePredicate) {
        tx.run(`DELETE FROM praises WHERE ${praisePredicate.sql}`, praisePredicate.params);
      }

      // class_announcements: `OR(teacher_id = teacherId, class_id IN classIds)` (lines 509-513),
      // with the `teacher_id`-only form at 528 as its empty-classes case. It is deliberately NOT
      // tied to the `if (classIds.length)` block that held it: the combined predicate answers the
      // same rows in both branches.
      const announcementPredicate = orAll([teachers, classes]);
      if (announcementPredicate) {
        tx.run(
          `DELETE FROM class_announcements WHERE ${announcementPredicate.sql}`,
          announcementPredicate.params,
        );
      }

      // danmaku_messages: `deleteMany({ class_id IN classIds })` inside `if (classIds.length)`
      // (line 524).
      if (classes) {
        tx.run(`DELETE FROM danmaku_messages WHERE ${classes.sql}`, classes.params);
      }

      // lucky_draw_config: `deleteMany({ teacher_id: teacherId })`, unconditional in the
      // pre-migration cascade (line 540). A teacher id set is always non-empty for this rule, so
      // the `inList` guard never drops it in practice; it is there because `IN ()` must not be
      // emittable.
      if (teachers) {
        tx.run(`DELETE FROM lucky_draw_config WHERE ${teachers.sql}`, teachers.params);
      }
    },
  };
}
