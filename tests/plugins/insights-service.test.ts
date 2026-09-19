/**
 * Insights service tests - the read model against recording port fakes.
 *
 * The suite it replaces (`api/modules/insights/insights.service.test.ts`, 104 lines) mocked `api/db.ts`
 * and asserted shapes. What it could not show is the property this migration is about: that the domain
 * now **owns no tables**. So the fakes here are not a shortcut - they are the assertion. `classroom`
 * and `engagement` are the only sources of data, every fake call is recorded, and
 * `plugins/insights/plugin.json` declares `data.adopted` and `data.reads` as empty, which the guardrail
 * suite checks separately.
 *
 * The arithmetic stayed in this domain on purpose (rounding, the two rates, the radar's `min(100, …)`,
 * the 75/60 thresholds), and that is what most of these cases pin: the ports return raw numbers, so a
 * mistake in the presentation layer is invisible anywhere else.
 */

import { describe, expect, it } from 'vitest';

import type { ClassReportInputs, StudentReportInputs } from '@thinkclass/contracts/domains/insights';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { EngagementPort } from '@thinkclass/contracts/domains/engagement';
import { ApiError } from '@thinkclass/kernel';

import { InsightsService } from '../../plugins/insights/src/insights.service.js';

/** A logger that records nothing; the service only warns when engagement is absent. */
const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } };

interface Calls {
  classReport: number[];
  studentReport: number[];
  accessView: number[];
  leaveCounts: number[][];
  recentLeaves: number[];
  praiseClass: number[];
  praiseStudent: number[];
  snippets: number[];
}

function build(options: {
  classReport?: Partial<ClassReportInputs>;
  studentReport?: Partial<StudentReportInputs>;
  accessView?: Record<number, { userId: number | null; classId: number; teacherId: number | null; parentIds: number[] }>;
  leaves?: Array<{ start_date: string; end_date: string; reason: string; status: string; review_comment: string | null; created_at: string }>;
  leaveCount?: number;
  praiseClass?: number;
  praiseStudent?: number;
  engagement?: boolean;
}) {
  const calls: Calls = {
    classReport: [],
    studentReport: [],
    accessView: [],
    leaveCounts: [],
    recentLeaves: [],
    praiseClass: [],
    praiseStudent: [],
    snippets: [],
  };

  const classroom = {
    async getClassReportInputs(classId: number): Promise<ClassReportInputs> {
      calls.classReport.push(classId);
      return {
        class: { id: classId, name: '一班', teacher_id: 7 },
        summary: {
          total_students: 2,
          average_points: 70.5,
          max_points: 100,
          min_points: 41,
          average_exam_score: 74.4,
          total_assignment_records: 3,
          submitted_assignment_records: 2,
          total_attendance_records: 8,
          present_records: 7,
          distribution: [{ label: '100+', value: 1 }],
          top_students: [{ id: 10, name: '小明', total_points: 100 }],
        },
        exam_trend: [{ id: 1, title: '月考', exam_date: '2026-01-01', average_score: 74.4 }],
        assignment_trend: [{ id: 2, title: '作业一', due_date: null, total_students: 2, submitted_students: 1 }],
        ...options.classReport,
      };
    },
    async getStudentReportInputs(studentId: number): Promise<StudentReportInputs> {
      calls.studentReport.push(studentId);
      return {
        student: { id: studentId, user_id: 21, class_id: 1, name: '小明', total_points: 100 },
        points: { weekly_earned: 5, weekly_spent: 2, total_earned: 200, total_spent: 100 },
        records: [{ id: 1, type: 'ADD_POINTS', amount: 5, description: 'x', created_at: '2026-01-01' }],
        recent_exams: [{ title: '月考', exam_date: '2026-01-01', total_score: 100, score: 80, feedback: null }],
        assignments: [{ title: '作业一', due_date: null, status: 'submitted', score: 90, teacher_feedback: null }],
        assignment_summary: { total_assignments: 4, submitted_assignments: 3 },
        average_exam_score: 81.6,
        attendance: { total_records: 10, present_count: 9, late_count: 1, absent_count: 0 },
        ...options.studentReport,
      };
    },
    async getStudentAccessView(studentId: number) {
      calls.accessView.push(studentId);
      const view = options.accessView?.[studentId];
      if (!view) return null;
      return { studentId, ...view };
    },
    async countLeaveRequestsForStudents(studentIds: number[]) {
      calls.leaveCounts.push(studentIds);
      return options.leaveCount ?? 3;
    },
    async listRecentLeaves(studentId: number) {
      calls.recentLeaves.push(studentId);
      return options.leaves ?? [];
    },
    async listClassStudents() {
      return [{ id: 10, classId: 1, userId: 21, name: '小明', totalPoints: 100, availablePoints: 100, groupId: null }];
    },
  } as unknown as ClassroomPort;

  const engagement: EngagementPort = {
    async countPraisesForClass(classId: number) {
      calls.praiseClass.push(classId);
      return options.praiseClass ?? 4;
    },
    async countPraisesForStudent(studentId: number) {
      calls.praiseStudent.push(studentId);
      return options.praiseStudent ?? 3;
    },
    async listPraiseSnippetsForStudent(studentId: number, limit: number) {
      calls.snippets.push(studentId);
      return {
        value: Array.from({ length: Math.min(limit, 2) }, (_, index) => ({
          title: '教师表扬',
          message: `表扬 ${index + 1}`,
          created_at: '2026-01-01',
        })),
      };
    },
  };

  const service = new InsightsService({
    ctx: { log: silentLogger } as never,
    classroom,
    engagement: () => (options.engagement === false ? null : engagement),
  });

  return { service, calls };
}

const TEACHER = { id: 7, role: 'teacher' };

async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

describe('getClassOverview', () => {
  it('rounds the averages and derives both rates from raw counts', async () => {
    const { service, calls } = build({});

    const result = await service.getClassOverview(TEACHER, '1');

    // 70.5 -> Math.round -> 71; 74.4 -> 74. The port returned the raw numbers.
    expect(result.summary.average_points).toBe(71);
    expect(result.summary.average_exam_score).toBe(74);
    // 2/3 submitted -> 67%; 7/8 present -> 88%.
    expect(result.summary.assignment_completion_rate).toBe(67);
    expect(result.summary.attendance_rate).toBe(88);
    expect(calls.classReport).toEqual([1]);
  });

  it('derives the assignment trend completion rate per row, guarding division by zero', async () => {
    const { service } = build({
      classReport: {
        assignment_trend: [
          { id: 1, title: 'a', due_date: null, total_students: 4, submitted_students: 3 },
          { id: 2, title: 'b', due_date: null, total_students: 0, submitted_students: 0 },
        ],
      },
    });

    const result = await service.getClassOverview(TEACHER, '1');
    expect(result.assignment_trend.map((row) => row.completion_rate)).toEqual([75, 0]);
  });

  it('counts leaves through classroom and praises through engagement', async () => {
    const { service, calls } = build({ leaveCount: 6, praiseClass: 12 });

    const result = await service.getClassOverview(TEACHER, '1');

    expect(result.summary.leave_count).toBe(6);
    expect(result.summary.praise_count).toBe(12);
    expect(calls.praiseClass).toEqual([1]);
    expect(calls.leaveCounts).toEqual([[10]]);
  });

  it('refuses a class this teacher does not own, before answering anything', async () => {
    const { service } = build({ classReport: { class: { id: 1, name: '一班', teacher_id: 9 } } });

    const error = await apiErrorOf(() => service.getClassOverview(TEACHER, '1'));
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('无权限查看该班级分析');
  });

  it('answers 404 for a missing class, and 403 for a teacher asking about one', async () => {
    // The legacy order: a teacher's ownership check ran first, so a missing class was also a 403 for
    // them, while an admin (no ownership branch) got the 404.
    const { service } = build({ classReport: { class: null } });

    expect(await apiErrorOf(() => service.getClassOverview(TEACHER, '1'))).toMatchObject({ statusCode: 403 });
    expect(await apiErrorOf(() => service.getClassOverview({ id: 1, role: 'admin' }, '1'))).toMatchObject({
      statusCode: 404,
      message: 'Class not found',
    });
  });

  it('rejects a non-numeric class id with the legacy 400', async () => {
    const { service } = build({});
    const error = await apiErrorOf(() => service.getClassOverview(TEACHER, 'abc'));
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid classId');
  });

  it('reports zero praises when engagement is not in this composition', async () => {
    const { service } = build({ engagement: false });
    const result = await service.getClassOverview(TEACHER, '1');
    expect(result.summary.praise_count).toBe(0);
  });
});

describe('the access check', () => {
  const view = { userId: 21, classId: 1, teacherId: 7, parentIds: [30] };

  it('lets an admin and a superadmin through without consulting the port', async () => {
    const { service, calls } = build({ accessView: { 10: view } });

    await service.getStudentRadar({ id: 1, role: 'admin' }, '10');
    await service.getStudentRadar({ id: 2, role: 'superadmin' }, '10');

    // The legacy check returned before any query for those two roles.
    expect(calls.accessView).toEqual([]);
  });

  it('requires a parent link, the owning teacher, or the student itself', async () => {
    const { service } = build({ accessView: { 10: view } });

    await expect(service.getStudentRadar({ id: 30, role: 'parent' }, '10')).resolves.toBeDefined();
    await expect(service.getStudentRadar({ id: 7, role: 'teacher' }, '10')).resolves.toBeDefined();
    await expect(service.getStudentRadar({ id: 21, role: 'student' }, '10')).resolves.toBeDefined();

    expect(await apiErrorOf(() => service.getStudentRadar({ id: 31, role: 'parent' }, '10'))).toMatchObject({ statusCode: 403 });
    expect(await apiErrorOf(() => service.getStudentRadar({ id: 9, role: 'teacher' }, '10'))).toMatchObject({ statusCode: 403 });
    expect(await apiErrorOf(() => service.getStudentRadar({ id: 99, role: 'student' }, '10'))).toMatchObject({ statusCode: 403 });
  });

  it('refuses an unknown role and an anonymous caller with the legacy message', async () => {
    const { service } = build({ accessView: { 10: view } });

    expect(await apiErrorOf(() => service.getStudentRadar({ id: 5, role: 'guest' }, '10'))).toMatchObject({
      statusCode: 403,
      message: '无权限访问该报告',
    });
    expect(await apiErrorOf(() => service.getStudentRadar({ id: null, role: null }, '10'))).toMatchObject({ statusCode: 403 });
  });

  it('answers 403 - not 404 - when the student is gone, matching the legacy order', async () => {
    const { service } = build({});
    expect(await apiErrorOf(() => service.getStudentRadar({ id: 7, role: 'teacher' }, '999'))).toMatchObject({
      statusCode: 403,
    });
  });
});

describe('getStudentReport', () => {
  it('rounds the exam average and derives the rates', async () => {
    const { service } = build({ accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } } });

    const result = await service.getStudentReport({ id: 7, role: 'teacher' }, '10');

    expect(result.summary.average_exam_score).toBe(82); // 81.6
    expect(result.summary.assignment_completion_rate).toBe(75); // 3/4
    expect(result.summary.attendance_rate).toBe(90); // 9/10
    expect(result.student).toEqual({ id: 10, class_id: 1, name: '小明', total_points: 100 });
  });

  it('uses the snippet count for praise_count, not a separate count call', async () => {
    // The legacy report counted `praises.length` after fetching five, so a student with 20 praises
    // showed 5 - preserved, and the reason `praise_count` is the array length here.
    const { service, calls } = build({ accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } } });

    const result = await service.getStudentReport({ id: 7, role: 'teacher' }, '10');

    expect(result.praises).toHaveLength(2);
    expect(result.summary.praise_count).toBe(2);
    expect(calls.snippets).toEqual([10]);
    expect(calls.praiseStudent).toEqual([]);
  });

  it('passes the leave projection through from classroom', async () => {
    const leaves = [
      { start_date: '2026-01-01', end_date: '2026-01-02', reason: '病假', status: 'approved', review_comment: null, created_at: '2026-01-01' },
    ];
    const { service, calls } = build({
      accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } },
      leaves,
    });

    const result = await service.getStudentReport({ id: 7, role: 'teacher' }, '10');
    expect(result.leaves).toEqual(leaves);
    expect(calls.recentLeaves).toEqual([10]);
  });

  it('answers 404 when the student row is gone but the access check passed', async () => {
    // An admin skips the access check, so this is the one path that reaches the 404.
    const { service } = build({ studentReport: { student: null } });
    expect(await apiErrorOf(() => service.getStudentReport({ id: 1, role: 'admin' }, '10'))).toMatchObject({
      statusCode: 404,
      message: 'Student not found',
    });
  });

  it('shows no praises when engagement is disabled', async () => {
    const { service } = build({
      accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } },
      engagement: false,
    });

    const result = await service.getStudentReport({ id: 7, role: 'teacher' }, '10');
    expect(result.praises).toEqual([]);
    expect(result.summary.praise_count).toBe(0);
  });

  it('rejects a non-numeric student id with the legacy 400', async () => {
    const { service } = build({});
    expect(await apiErrorOf(() => service.getStudentReport({ id: 7, role: 'teacher' }, 'abc'))).toMatchObject({
      statusCode: 400,
      message: 'Invalid studentId',
    });
  });
});

describe('getStudentRadar', () => {
  it('computes the five metrics with the legacy clamps and thresholds', async () => {
    const { service } = build({
      accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } },
      praiseStudent: 3,
    });

    const { report } = await service.getStudentRadar({ id: 7, role: 'teacher' }, '10');

    expect(report.metrics).toEqual({
      积分表现: 100, // min(100, 100)
      作业完成: 75, // 3/4
      考试成绩: 82, // 81.6 rounded
      出勤表现: 90, // 9/10
      教师表扬: 60, // 3 * 20
    });
    expect(report.strengths).toEqual(['积分表现', '作业完成', '考试成绩', '出勤表现']);
    expect(report.weaknesses).toEqual([]);
    expect(report.studentName).toBe('小明');
  });

  it('clamps the praise metric at 100 and the points metric at both ends', async () => {
    const { service } = build({
      accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } },
      praiseStudent: 9, // 180 -> clamped to 100
      studentReport: { student: { id: 10, user_id: 21, class_id: 1, name: '小明', total_points: 150 } },
    });

    const { report } = await service.getStudentRadar({ id: 7, role: 'teacher' }, '10');
    expect(report.metrics.教师表扬).toBe(100);
    expect(report.metrics.积分表现).toBe(100); // min(100, 150)
  });

  it('lists a metric as a weakness below 60 and picks the matching advice', async () => {
    const { service } = build({
      accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } },
      studentReport: {
        student: { id: 10, user_id: 21, class_id: 1, name: '小明', total_points: 40 },
        assignment_summary: { total_assignments: 10, submitted_assignments: 5 }, // 50
        average_exam_score: 30,
        attendance: { total_records: 10, present_count: 5, late_count: 0, absent_count: 5 }, // 50
      },
      praiseStudent: 1, // 20
    });

    const { report } = await service.getStudentRadar({ id: 7, role: 'teacher' }, '10');

    expect(report.metrics).toEqual({ 积分表现: 40, 作业完成: 50, 考试成绩: 30, 出勤表现: 50, 教师表扬: 20 });
    expect(report.weaknesses).toEqual(['积分表现', '作业完成', '考试成绩', '出勤表现', '教师表扬']);
    expect(report.strengths).toEqual([]);
    expect(report.advice).toEqual([
      '优先提升作业按时提交率，减少遗漏任务。',
      '建议围绕最近考试错题做集中复盘。',
      '关注迟到和缺勤原因，尽量保持稳定出勤。',
    ]);
  });

  it('guards the rates against a student with no assignments or attendance', async () => {
    const { service } = build({
      accessView: { 10: { userId: 21, classId: 1, teacherId: 7, parentIds: [] } },
      studentReport: {
        assignment_summary: { total_assignments: 0, submitted_assignments: 0 },
        attendance: { total_records: 0, present_count: 0, late_count: 0, absent_count: 0 },
      },
      praiseStudent: 0,
    });

    const { report } = await service.getStudentRadar({ id: 7, role: 'teacher' }, '10');
    expect(report.metrics.作业完成).toBe(0);
    expect(report.metrics.出勤表现).toBe(0);
    expect(report.metrics.教师表扬).toBe(0);
  });
});
