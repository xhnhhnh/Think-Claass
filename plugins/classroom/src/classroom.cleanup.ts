/**
 * classroom's account-deletion cleanup rule.
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
 * ## Why five of these tables are new to the plugin
 *
 * `attendance_records`, `leave_requests`, `parent_students`, `student_groups` and `point_presets`
 * had no owner at all: the boot schema created them, classroom was already reading them (and, for
 * attendance/leaves/groups/presets/parent links, already writing them through `ctx.rawDb` - see the
 * manifest's `_known_debt`). An unowned table cannot have a cleanup rule, because a rule may only
 * name tables its plugin declared, so the ownership question had to be answered rather than worked
 * around. They are classroom's: attendance and leave are the class register, `student_groups` and
 * `point_presets` are class configuration, and `parent_students` is the parent link classroom
 * already maintains through `classroom.public`. Declaring them turns those `ctx.rawDb` writes into
 * ordinary, checked ones.
 *
 * ## Order inside this rule
 *
 * Children before parents, because foreign keys are enforced immediately: `attendance_records`,
 * `leave_requests`, `parent_students` and `records` all reference `students`, `student_groups`
 * references `classes`, and `students` references `classes`. The registry orders *rules*; ordering
 * within one owner's set of tables is the owner's job, and is what the pre-migration cascade did by
 * hand.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = [
  'attendance_records',
  'leave_requests',
  'parent_students',
  'records',
  'student_groups',
  'students',
  'classes',
  'point_presets',
];

export function createClassroomCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const students = inList('student_id', subject.studentIds);
      const classes = inList('class_id', subject.classIds);
      const teachers = inList('teacher_id', subject.teacherIds);

      // attendance_records: `OR(student_id IN students, class_id IN classes)` (admin.repository.ts
      // lines 447-456 - the statement only ran when one of the two sets was non-empty; `orAll`
      // returns null in exactly that case, so the branch is preserved).
      const attendance = orAll([students, classes]);
      if (attendance) {
        tx.run(`DELETE FROM attendance_records WHERE ${attendance.sql}`, attendance.params);
      }

      // leave_requests: the pre-migration code had two branches - with students, `OR(student_id IN
      // students, reviewer_id = teacher)`; without them, `reviewer_id = teacher` (lines 463-467 and
      // 477). Combining them is not a simplification: the second branch is a special case of the
      // first, and the rule is about the teacher's classes either way. `reviewer_id` holds a teacher
      // id rather than a student id, so it gets its own column fragment.
      const reviewer = inList('reviewer_id', subject.teacherIds);
      const leavePredicate = orAll([students, reviewer]);
      if (leavePredicate) {
        tx.run(`DELETE FROM leave_requests WHERE ${leavePredicate.sql}`, leavePredicate.params);
      }

      if (students) {
        tx.run(`DELETE FROM parent_students WHERE ${students.sql}`, students.params);
        tx.run(`DELETE FROM records WHERE ${students.sql}`, students.params);
      }

      if (classes) {
        tx.run(`DELETE FROM student_groups WHERE ${classes.sql}`, classes.params);
      }

      // students before classes: `students.class_id -> classes.id`.
      const studentRows = inList('id', subject.studentIds);
      if (studentRows) {
        tx.run(`DELETE FROM students WHERE ${studentRows.sql}`, studentRows.params);
      }
      const classRows = inList('id', subject.classIds);
      if (classRows) {
        tx.run(`DELETE FROM classes WHERE ${classRows.sql}`, classRows.params);
      }

      // point_presets: `deleteMany({ teacher_id })`, unconditional in the pre-migration cascade
      // (line 549).
      if (teachers) {
        tx.run(`DELETE FROM point_presets WHERE ${teachers.sql}`, teachers.params);
      }
    },
  };
}
