/**
 * Report aggregates for the insights domain (P4.3b.12).
 *
 * `insights` is a read model: all twelve of its tables belong to somebody else, and eight belong to
 * classroom. These three methods are the classroom side of that - and they live here, in the plugin
 * that owns the rows, rather than in the consumer, for two reasons:
 *
 *   1. **The aggregates need joins that only this plugin may run.** `student_exams JOIN students ON
 *      s.class_id = ?` and `attendance_records WHERE class_id = ?` cross tables classroom declares as
 *      reads; a consumer would have to declare the same set and re-implement the joins.
 *   2. **Publishing rows would publish more than a report needs.** A `listStudents(classId)` that
 *      returned every row would invite the consumer to aggregate, and every new consumer would add
 *      another copy of "what a class average is".
 *
 * The SQL is relocated from `api/modules/insights/insights.service.ts` **verbatim** - same casts,
 * same `COALESCE`, same rounding boundaries, same `ORDER BY ... LIMIT` - because these numbers are
 * rendered on a dashboard and a different `Math.round` would be a visible change. Rounding stays in
 * the consumer where the legacy code did it (the port returns raw averages and raw counts).
 *
 * The four tables read but not owned here (`exams`, `student_exams`, `assignments`,
 * `student_assignments`) are declared in the manifest's `data.reads`: they moved to
 * `plugins/assignments`, and reading them for a report is the same shape as reading `students` from
 * the learning plugin, not a second ownership claim.
 */

import type {
  ClassReportInputs,
  StudentReportInputs,
} from '@thinkclass/contracts/domains/insights';
import type { DbApi } from '@thinkclass/plugin-sdk';

import type { ClassRow, StudentRow } from './classroom.types.js';
import type { NameCipher } from './classroom.support.js';

export interface ReportQueries {
  classReportInputs(classId: number, cipher: NameCipher): ClassReportInputs;
  studentReportInputs(studentId: number, cipher: NameCipher): StudentReportInputs;
  studentAccessView(studentId: number): {
    studentId: number;
    userId: number | null;
    classId: number;
    teacherId: number | null;
    /** The parent link ids for this student, for the report access check. */
    parentIds: number[];
  } | null;
}

export function createReportQueries(db: DbApi): ReportQueries {
  return {
    classReportInputs(classId, cipher) {
      const classRow = db.get<ClassRow>(`SELECT id, name, teacher_id FROM classes WHERE id = ?`, [classId]);

      const summary = db.get<{
        total_students: number;
        average_points: number;
        max_points: number;
        min_points: number;
      }>(
        `SELECT
           COUNT(*) as total_students,
           COALESCE(AVG(total_points), 0) as average_points,
           COALESCE(MAX(total_points), 0) as max_points,
           COALESCE(MIN(total_points), 0) as min_points
         FROM students
         WHERE class_id = ?`,
        [classId],
      );

      const averageExam = db.get<{ average_exam_score: number }>(
        `SELECT COALESCE(AVG(se.score), 0) as average_exam_score
           FROM student_exams se
           JOIN students s ON s.id = se.student_id
          WHERE s.class_id = ? AND se.score IS NOT NULL`,
        [classId],
      );

      const assignment = db.get<{
        total_assignment_records: number;
        submitted_assignment_records: number;
      }>(
        `SELECT
           COUNT(sa.id) as total_assignment_records,
           COALESCE(SUM(CASE WHEN sa.status = 'submitted' THEN 1 ELSE 0 END), 0) as submitted_assignment_records
         FROM student_assignments sa
         JOIN students s ON s.id = sa.student_id
         WHERE s.class_id = ?`,
        [classId],
      );

      const attendance = db.get<{ total_attendance_records: number; present_records: number }>(
        `SELECT
           COUNT(*) as total_attendance_records,
           COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) as present_records
         FROM attendance_records
         WHERE class_id = ?`,
        [classId],
      );

      const distribution = db.query<{ label: string; value: number }>(
        `SELECT
           CASE
             WHEN total_points >= 100 THEN '100+'
             WHEN total_points >= 80 THEN '80-99'
             WHEN total_points >= 60 THEN '60-79'
             WHEN total_points >= 40 THEN '40-59'
             ELSE '0-39'
           END as label,
           COUNT(*) as value
         FROM students
         WHERE class_id = ?
         GROUP BY label
         ORDER BY MIN(total_points) DESC`,
        [classId],
      );

      const examTrend = db.query<{ id: number; title: string; exam_date: string | null; average_score: number }>(
        `SELECT
           e.id,
           e.title,
           e.exam_date,
           COALESCE(AVG(se.score), 0) as average_score
         FROM exams e
         LEFT JOIN student_exams se ON se.exam_id = e.id AND se.score IS NOT NULL
         WHERE e.class_id = ?
         GROUP BY e.id, e.title, e.exam_date
         ORDER BY COALESCE(e.exam_date, e.created_at) DESC
         LIMIT 6`,
        [classId],
      );

      const assignmentTrend = db.query<{
        id: number;
        title: string;
        due_date: string | null;
        total_students: number;
        submitted_students: number;
      }>(
        `SELECT
           a.id,
           a.title,
           a.due_date,
           COUNT(sa.id) as total_students,
           COALESCE(SUM(CASE WHEN sa.status = 'submitted' THEN 1 ELSE 0 END), 0) as submitted_students
         FROM assignments a
         LEFT JOIN student_assignments sa ON sa.assignment_id = a.id
         WHERE a.class_id = ?
         GROUP BY a.id, a.title, a.due_date
         ORDER BY COALESCE(a.due_date, a.created_at) DESC
         LIMIT 6`,
        [classId],
      );

      // Names are decrypted here for the same reason `listStudentNamesByIds` decrypts: the cipher is
      // this domain's concern, and a consumer handed ciphertext would either display it or need the key.
      const topStudents = db
        .query<Pick<StudentRow, 'id' | 'name' | 'total_points'>>(
          `SELECT id, name, total_points
             FROM students
            WHERE class_id = ?
            ORDER BY total_points DESC, id ASC
            LIMIT 5`,
          [classId],
        )
        .map((student) => ({
          id: student.id,
          name: cipher.decrypt(student.name),
          total_points: student.total_points ?? 0,
        }));

      return {
        class: classRow
          ? { id: classRow.id, name: classRow.name, teacher_id: classRow.teacher_id ?? 0 }
          : null,
        summary: {
          total_students: summary?.total_students ?? 0,
          average_points: Number(summary?.average_points ?? 0),
          max_points: summary?.max_points ?? 0,
          min_points: summary?.min_points ?? 0,
          average_exam_score: Number(averageExam?.average_exam_score ?? 0),
          total_assignment_records: assignment?.total_assignment_records ?? 0,
          submitted_assignment_records: assignment?.submitted_assignment_records ?? 0,
          total_attendance_records: attendance?.total_attendance_records ?? 0,
          present_records: attendance?.present_records ?? 0,
          distribution,
          top_students: topStudents,
        },
        exam_trend: examTrend,
        assignment_trend: assignmentTrend,
      };
    },

    studentReportInputs(studentId, cipher) {
      const student = db.get<StudentRow>(
        `SELECT id, user_id, class_id, name, total_points FROM students WHERE id = ?`,
        [studentId],
      );

      // Two queries, not one: the weekly totals are filtered by `created_at` and the all-time totals
      // are not. The first version merged them with scalar subqueries, which is wrong in a way that
      // would not fail a smoke test - `AVG`/`SUM` over an empty weekly window is 0, so the all-time
      // figures would silently read 0 for any student with no ledger row in the last seven days.
      const weekly = db.get<{ weekly_earned: number; weekly_spent: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as weekly_earned,
           COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as weekly_spent
         FROM records
         WHERE student_id = ? AND datetime(created_at) >= datetime('now', '-7 days')`,
        [studentId],
      );

      const totals = db.get<{ total_earned: number; total_spent: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_earned,
           COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_spent
         FROM records
         WHERE student_id = ?`,
        [studentId],
      );

      const records = db.query<{
        id: number;
        type: string;
        amount: number;
        description: string | null;
        created_at: string;
      }>(
        `SELECT id, type, amount, description, created_at
           FROM records WHERE student_id = ? ORDER BY created_at DESC LIMIT 20`,
        [studentId],
      );

      const exams = db.query<{
        title: string;
        exam_date: string | null;
        total_score: number | null;
        score: number | null;
        feedback: string | null;
      }>(
        `SELECT e.title, e.exam_date, e.total_score, se.score, se.feedback
           FROM student_exams se
           JOIN exams e ON e.id = se.exam_id
          WHERE se.student_id = ? AND se.score IS NOT NULL
          ORDER BY COALESCE(e.exam_date, e.created_at) DESC
          LIMIT 6`,
        [studentId],
      );

      const examSummary = db.get<{ average_exam_score: number }>(
        `SELECT COALESCE(AVG(score), 0) as average_exam_score
           FROM student_exams WHERE student_id = ? AND score IS NOT NULL`,
        [studentId],
      );

      const assignments = db.query<{
        title: string;
        due_date: string | null;
        status: string;
        score: number | null;
        teacher_feedback: string | null;
      }>(
        `SELECT a.title, a.due_date, sa.status, sa.score, sa.teacher_feedback
           FROM student_assignments sa
           JOIN assignments a ON a.id = sa.assignment_id
          WHERE sa.student_id = ?
          ORDER BY COALESCE(sa.submitted_at, sa.created_at) DESC
          LIMIT 6`,
        [studentId],
      );

      const assignmentSummary = db.get<{ total_assignments: number; submitted_assignments: number }>(
        `SELECT
           COUNT(*) as total_assignments,
           COALESCE(SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END), 0) as submitted_assignments
         FROM student_assignments
         WHERE student_id = ?`,
        [studentId],
      );

      const attendance = db.get<{
        total_records: number;
        present_count: number;
        late_count: number;
        absent_count: number;
      }>(
        `SELECT
           COUNT(*) as total_records,
           COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) as present_count,
           COALESCE(SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END), 0) as late_count,
           COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0) as absent_count
         FROM attendance_records
         WHERE student_id = ?`,
        [studentId],
      );

      return {
        student: student
          ? {
              id: student.id,
              user_id: student.user_id ?? null,
              class_id: student.class_id,
              // Decrypted here, as everywhere else in this plugin: the consumer never sees ciphertext.
              name: cipher.decrypt(student.name),
              total_points: student.total_points ?? 0,
            }
          : null,
        points: {
          weekly_earned: weekly?.weekly_earned ?? 0,
          weekly_spent: weekly?.weekly_spent ?? 0,
          total_earned: totals?.total_earned ?? 0,
          total_spent: totals?.total_spent ?? 0,
        },
        records,
        recent_exams: exams,
        assignments,
        assignment_summary: {
          total_assignments: assignmentSummary?.total_assignments ?? 0,
          submitted_assignments: assignmentSummary?.submitted_assignments ?? 0,
        },
        average_exam_score: Number(examSummary?.average_exam_score ?? 0),
        attendance: {
          total_records: attendance?.total_records ?? 0,
          present_count: attendance?.present_count ?? 0,
          late_count: attendance?.late_count ?? 0,
          absent_count: attendance?.absent_count ?? 0,
        },
      };
    },

    studentAccessView(studentId) {
      // One query for what the legacy access check assembled from three: the teacher came from
      // `students JOIN classes`, the student's own login from `students.user_id`, and the parent
      // relation from `parent_students`.
      const row = db.get<{ id: number; user_id: number | null; class_id: number; teacher_id: number | null }>(
        `SELECT s.id, s.user_id, s.class_id, c.teacher_id
           FROM students s
           LEFT JOIN classes c ON c.id = s.class_id
          WHERE s.id = ?`,
        [studentId],
      );
      if (!row) return null;

      const parentIds = db
        .query<{ parent_id: number }>(`SELECT parent_id FROM parent_students WHERE student_id = ?`, [studentId])
        .map((parent) => parent.parent_id);

      return {
        studentId: row.id,
        userId: row.user_id ?? null,
        classId: row.class_id,
        teacherId: row.teacher_id ?? null,
        parentIds,
      };
    },
  };
}
