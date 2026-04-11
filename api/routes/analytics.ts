import { Router, type Request, type Response } from 'express';

import db, { decrypt } from '../db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { getRequestActor } from '../utils/requestAuth.js';

const router = Router();

function getClassOwnedByTeacher(classId: number, teacherId: number) {
  return db.prepare('SELECT id, teacher_id, name FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
}

function assertStudentAccess(req: Request, studentId: number) {
  const actor = getRequestActor(req);
  if (!actor.role || !actor.id) {
    throw new ApiError(403, '无权限访问该报告');
  }

  if (actor.role === 'admin' || actor.role === 'superadmin') {
    return;
  }

  if (actor.role === 'parent') {
    const relation = db.prepare('SELECT 1 FROM parent_students WHERE parent_id = ? AND student_id = ?').get(actor.id, studentId);
    if (!relation) {
      throw new ApiError(403, '无权限访问该报告');
    }
    return;
  }

  if (actor.role === 'teacher') {
    const relation = db
      .prepare(
        `
        SELECT 1
        FROM students s
        JOIN classes c ON c.id = s.class_id
        WHERE s.id = ? AND c.teacher_id = ?
      `,
      )
      .get(studentId, actor.id);
    if (!relation) {
      throw new ApiError(403, '无权限访问该报告');
    }
    return;
  }

  if (actor.role === 'student') {
    const relation = db.prepare('SELECT 1 FROM students WHERE id = ? AND user_id = ?').get(studentId, actor.id);
    if (!relation) {
      throw new ApiError(403, '无权限访问该报告');
    }
    return;
  }

  throw new ApiError(403, '无权限访问该报告');
}

router.get(
  '/classes/:classId/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const classId = Number(req.params.classId);
    if (!Number.isFinite(classId)) {
      throw new ApiError(400, 'Invalid classId');
    }

    const actor = getRequestActor(req);
    if (actor.role === 'teacher' && actor.id) {
      const ownedClass = getClassOwnedByTeacher(classId, actor.id);
      if (!ownedClass) {
        throw new ApiError(403, '无权限查看该班级分析');
      }
    }

    const classInfo = db.prepare('SELECT id, name, teacher_id FROM classes WHERE id = ?').get(classId) as
      | { id: number; name: string; teacher_id: number }
      | undefined;
    if (!classInfo) {
      throw new ApiError(404, 'Class not found');
    }

    const summary = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_students,
          COALESCE(AVG(total_points), 0) as average_points,
          COALESCE(MAX(total_points), 0) as max_points,
          COALESCE(MIN(total_points), 0) as min_points
        FROM students
        WHERE class_id = ?
      `,
      )
      .get(classId) as any;

    const averageExam = db
      .prepare(
        `
        SELECT COALESCE(AVG(se.score), 0) as average_exam_score
        FROM student_exams se
        JOIN students s ON s.id = se.student_id
        WHERE s.class_id = ? AND se.score IS NOT NULL
      `,
      )
      .get(classId) as any;

    const assignment = db
      .prepare(
        `
        SELECT
          COUNT(sa.id) as total_assignment_records,
          COALESCE(SUM(CASE WHEN sa.status = 'submitted' THEN 1 ELSE 0 END), 0) as submitted_assignment_records
        FROM student_assignments sa
        JOIN students s ON s.id = sa.student_id
        WHERE s.class_id = ?
      `,
      )
      .get(classId) as any;

    const attendance = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_attendance_records,
          COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) as present_records
        FROM attendance_records
        WHERE class_id = ?
      `,
      )
      .get(classId) as any;

    const praises = db
      .prepare(
        `
        SELECT COUNT(*) as praise_count
        FROM praises p
        JOIN students s ON s.id = p.student_id
        WHERE s.class_id = ?
      `,
      )
      .get(classId) as any;

    const leaves = db
      .prepare(
        `
        SELECT COUNT(*) as leave_count
        FROM leave_requests lr
        JOIN students s ON s.id = lr.student_id
        WHERE s.class_id = ?
      `,
      )
      .get(classId) as any;

    const distributions = db
      .prepare(
        `
        SELECT
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
        ORDER BY MIN(total_points) DESC
      `,
      )
      .all(classId);

    const examTrend = db
      .prepare(
        `
        SELECT
          e.id,
          e.title,
          e.exam_date,
          COALESCE(AVG(se.score), 0) as average_score
        FROM exams e
        LEFT JOIN student_exams se ON se.exam_id = e.id AND se.score IS NOT NULL
        WHERE e.class_id = ?
        GROUP BY e.id, e.title, e.exam_date
        ORDER BY COALESCE(e.exam_date, e.created_at) DESC
        LIMIT 6
      `,
      )
      .all(classId);

    const assignmentTrend = db
      .prepare(
        `
        SELECT
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
        LIMIT 6
      `,
      )
      .all(classId)
      .map((item: any) => ({
        ...item,
        completion_rate: item.total_students ? Math.round((item.submitted_students / item.total_students) * 100) : 0,
      }));

    const topStudents = db
      .prepare(
        `
        SELECT id, name, total_points
        FROM students
        WHERE class_id = ?
        ORDER BY total_points DESC, id ASC
        LIMIT 5
      `,
      )
      .all(classId)
      .map((student: any) => ({
        ...student,
        name: decrypt(student.name),
      }));

    res.json({
      success: true,
      class: classInfo,
      summary: {
        total_students: summary.total_students ?? 0,
        average_points: Math.round(Number(summary.average_points ?? 0)),
        max_points: summary.max_points ?? 0,
        min_points: summary.min_points ?? 0,
        average_exam_score: Math.round(Number(averageExam.average_exam_score ?? 0)),
        assignment_completion_rate: assignment.total_assignment_records
          ? Math.round((assignment.submitted_assignment_records / assignment.total_assignment_records) * 100)
          : 0,
        attendance_rate: attendance.total_attendance_records
          ? Math.round((attendance.present_records / attendance.total_attendance_records) * 100)
          : 0,
        praise_count: praises.praise_count ?? 0,
        leave_count: leaves.leave_count ?? 0,
      },
      distributions,
      exam_trend: examTrend,
      assignment_trend: assignmentTrend,
      top_students: topStudents,
    });
  }),
);

router.get(
  '/students/:studentId/report',
  asyncHandler(async (req: Request, res: Response) => {
    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId)) {
      throw new ApiError(400, 'Invalid studentId');
    }

    assertStudentAccess(req, studentId);

    const student = db.prepare('SELECT id, user_id, class_id, name, total_points FROM students WHERE id = ?').get(studentId) as
      | { id: number; user_id: number | null; class_id: number; name: string; total_points: number }
      | undefined;
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    const records = db
      .prepare('SELECT id, type, amount, description, created_at FROM records WHERE student_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(studentId) as any[];

    const weeklyRecords = db
      .prepare(
        `
        SELECT
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as weekly_earned,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as weekly_spent
        FROM records
        WHERE student_id = ? AND datetime(created_at) >= datetime('now', '-7 days')
      `,
      )
      .get(studentId) as any;

    const totalRecords = db
      .prepare(
        `
        SELECT
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_earned,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_spent
        FROM records
        WHERE student_id = ?
      `,
      )
      .get(studentId) as any;

    const exams = db
      .prepare(
        `
        SELECT e.title, e.exam_date, e.total_score, se.score, se.feedback
        FROM student_exams se
        JOIN exams e ON e.id = se.exam_id
        WHERE se.student_id = ? AND se.score IS NOT NULL
        ORDER BY COALESCE(e.exam_date, e.created_at) DESC
        LIMIT 6
      `,
      )
      .all(studentId);

    const examSummary = db
      .prepare('SELECT COALESCE(AVG(score), 0) as average_exam_score FROM student_exams WHERE student_id = ? AND score IS NOT NULL')
      .get(studentId) as any;

    const assignments = db
      .prepare(
        `
        SELECT a.title, a.due_date, sa.status, sa.score, sa.teacher_feedback
        FROM student_assignments sa
        JOIN assignments a ON a.id = sa.assignment_id
        WHERE sa.student_id = ?
        ORDER BY COALESCE(sa.submitted_at, sa.created_at) DESC
        LIMIT 6
      `,
      )
      .all(studentId) as any[];

    const assignmentSummary = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_assignments,
          COALESCE(SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END), 0) as submitted_assignments
        FROM student_assignments
        WHERE student_id = ?
      `,
      )
      .get(studentId) as any;

    const attendanceSummary = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_records,
          COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) as present_count,
          COALESCE(SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END), 0) as late_count,
          COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0) as absent_count
        FROM attendance_records
        WHERE student_id = ?
      `,
      )
      .get(studentId) as any;

    const praises = db
      .prepare(
        `
        SELECT content, created_at
        FROM praises
        WHERE student_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `,
      )
      .all(studentId)
      .map((praise: any) => ({
        title: '教师表扬',
        message: praise.content,
        created_at: praise.created_at,
      }));

    const leaves = db
      .prepare(
        `
        SELECT start_date, end_date, reason, status, review_comment, created_at
        FROM leave_requests
        WHERE student_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      `,
      )
      .all(studentId);

    res.json({
      success: true,
      student: {
        id: student.id,
        class_id: student.class_id,
        name: decrypt(student.name),
        total_points: student.total_points,
      },
      summary: {
        weekly_earned: weeklyRecords.weekly_earned ?? 0,
        weekly_spent: weeklyRecords.weekly_spent ?? 0,
        total_earned: totalRecords.total_earned ?? 0,
        total_spent: totalRecords.total_spent ?? 0,
        average_exam_score: Math.round(Number(examSummary.average_exam_score ?? 0)),
        assignment_completion_rate: assignmentSummary.total_assignments
          ? Math.round((assignmentSummary.submitted_assignments / assignmentSummary.total_assignments) * 100)
          : 0,
        attendance_rate: attendanceSummary.total_records
          ? Math.round((attendanceSummary.present_count / attendanceSummary.total_records) * 100)
          : 0,
        praise_count: praises.length,
      },
      records,
      recent_exams: exams,
      assignments,
      attendance: {
        total_records: attendanceSummary.total_records ?? 0,
        present_count: attendanceSummary.present_count ?? 0,
        late_count: attendanceSummary.late_count ?? 0,
        absent_count: attendanceSummary.absent_count ?? 0,
      },
      praises,
      leaves,
    });
  }),
);

router.get(
  '/students/:studentId/radar',
  asyncHandler(async (req: Request, res: Response) => {
    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId)) {
      throw new ApiError(400, 'Invalid studentId');
    }

    assertStudentAccess(req, studentId);

    const student = db.prepare('SELECT id, name, total_points FROM students WHERE id = ?').get(studentId) as
      | { id: number; name: string; total_points: number }
      | undefined;
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    const assignmentSummary = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_assignments,
          COALESCE(SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END), 0) as submitted_assignments
        FROM student_assignments
        WHERE student_id = ?
      `,
      )
      .get(studentId) as any;

    const examSummary = db
      .prepare('SELECT COALESCE(AVG(score), 0) as average_exam_score FROM student_exams WHERE student_id = ? AND score IS NOT NULL')
      .get(studentId) as any;

    const attendanceSummary = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_records,
          COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0) as present_count
        FROM attendance_records
        WHERE student_id = ?
      `,
      )
      .get(studentId) as any;

    const praiseCount = db.prepare('SELECT COUNT(*) as count FROM praises WHERE student_id = ?').get(studentId) as any;

    const metrics = {
      积分表现: Math.min(100, Math.max(0, student.total_points)),
      作业完成: assignmentSummary.total_assignments
        ? Math.round((assignmentSummary.submitted_assignments / assignmentSummary.total_assignments) * 100)
        : 0,
      考试成绩: Math.round(Number(examSummary.average_exam_score ?? 0)),
      出勤表现: attendanceSummary.total_records
        ? Math.round((attendanceSummary.present_count / attendanceSummary.total_records) * 100)
        : 0,
      教师表扬: Math.min(100, (praiseCount.count ?? 0) * 20),
    };

    const metricEntries = Object.entries(metrics);
    const strengths = metricEntries.filter(([, value]) => value >= 75).map(([label]) => label);
    const weaknesses = metricEntries.filter(([, value]) => value < 60).map(([label]) => label);

    const advice = [
      metrics.作业完成 < 70 ? '优先提升作业按时提交率，减少遗漏任务。' : '继续保持稳定的作业完成节奏。',
      metrics.考试成绩 < 70 ? '建议围绕最近考试错题做集中复盘。' : '可以尝试更高难度练习巩固优势。',
      metrics.出勤表现 < 90 ? '关注迟到和缺勤原因，尽量保持稳定出勤。' : '保持良好出勤习惯，有利于持续进步。',
    ];

    res.json({
      success: true,
      report: {
        studentName: decrypt(student.name),
        metrics,
        strengths,
        weaknesses,
        advice,
      },
    });
  }),
);

export default router;
