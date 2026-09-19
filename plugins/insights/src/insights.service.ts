/**
 * Insights service - the reporting read model.
 *
 * Relocated from `api/modules/insights/insights.service.ts`, where every query ran against the shared
 * `api/db.ts` handle and reached into twelve tables owned by four other domains. HANDOFF section 8.9
 * called this domain "not a domain you can move on its own; it is a cross-domain read model" and
 * deferred it until the owners published report ports. They do now:
 *
 *   - `classroom.public.getClassReportInputs` / `getStudentReportInputs` / `getStudentAccessView`
 *     (P4.3b.12) cover eight of the twelve tables, including the four that belong to
 *     `plugins/assignments`;
 *   - `engagement.public` supplies the praise count and the newest praise snippets.
 *
 * So this plugin **owns no tables at all** - `data.adopted` and `data.reads` are both empty - and
 * that is the point: a read model that declares no data is a read model that cannot drift into
 * owning some.
 *
 * ## What stayed here
 *
 * The *presentation* arithmetic, deliberately: `Math.round` of the averages, the rates
 * (`submitted / total` with a zero guard), the radar's `min(100, points)` and
 * `min(100, praises * 20)`, the 75/60 strength and weakness thresholds, the three advice strings.
 * Those are this domain's business, and the ports return raw numbers so there is exactly one place
 * that decides what a rate looks like.
 *
 * ## Refusals
 *
 * The ports answer refusals as data, so the legacy statuses are mapped here: a missing student or
 * class is 404 with the legacy message, and a failed access check is 403. The access check itself
 * (P4.3b.12) is: an admin sees anything, a parent needs a link to that student, a teacher needs to
 * own the student's class, a student must be that student. `getStudentAccessView` supplies the facts;
 * the decision stays here because it also depends on the actor's role.
 */

import { ApiError } from '@thinkclass/kernel';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { EngagementPort } from '@thinkclass/contracts/domains/engagement';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { ReportActor } from './insights.types.js';

export interface InsightsServiceDeps {
  ctx: KernelContext;
  classroom: ClassroomPort;
  /**
   * Optional: a deployment with the engagement domain disabled still renders reports.
   *
   * Resolved at call time, not captured in `setup()` - the trap HANDOFF section 9 documents for
   * `challenge`/`pet`: plugins are set up in slug order and the registry is a live map.
   */
  engagement: () => EngagementPort | null;
}

/** The refusal statuses the legacy service threw, so the mapping is in one place. */
function refusalError(refusal: { code: string; message: string } | undefined, fallbackStatus = 403): ApiError {
  if (!refusal) return new ApiError(fallbackStatus, '无权限访问该报告');
  if (refusal.code === 'student-not-found') return new ApiError(404, 'Student not found');
  if (refusal.code === 'class-not-found') return new ApiError(404, 'Class not found');
  return new ApiError(403, '无权限访问该报告');
}

export class InsightsService {
  private readonly ctx: KernelContext;
  private readonly classroom: ClassroomPort;
  private readonly engagement: () => EngagementPort | null;

  constructor(deps: InsightsServiceDeps) {
    this.ctx = deps.ctx;
    this.classroom = deps.classroom;
    this.engagement = deps.engagement;
  }

  /**
   * The legacy `assertStudentAccess`.
   *
   * Four role branches, in the legacy order, over facts the classroom port supplies: the student's
   * class, its teacher, the student's own login id and the parent links.
   */
  private async assertStudentAccess(actor: ReportActor, studentId: number): Promise<void> {
    if (!actor.role || !actor.id) {
      throw new ApiError(403, '无权限访问该报告');
    }

    if (actor.role === 'admin' || actor.role === 'superadmin') return;

    const view = await this.classroom.getStudentAccessView(studentId);
    // A missing student is the *later* 404 in the legacy flow (the access check ran first and would
    // have failed with 403 for a teacher). Keeping that order matters: a teacher asking about a
    // removed student got 403, not 404.
    if (!view) throw new ApiError(403, '无权限访问该报告');

    if (actor.role === 'parent') {
      if (!view.parentIds.includes(actor.id)) throw new ApiError(403, '无权限访问该报告');
      return;
    }

    if (actor.role === 'teacher') {
      if (view.teacherId !== actor.id) throw new ApiError(403, '无权限访问该报告');
      return;
    }

    if (actor.role === 'student') {
      if (view.userId !== actor.id) throw new ApiError(403, '无权限访问该报告');
      return;
    }

    throw new ApiError(403, '无权限访问该报告');
  }

  /** The praise count, or 0 when the engagement domain is not in this composition. */
  private praiseCount(run: (port: EngagementPort) => Promise<number>): Promise<number> {
    const port = this.engagement();
    if (!port) {
      this.ctx.log.warn('praise count reported as zero: engagement.public unavailable');
      return Promise.resolve(0);
    }
    return run(port);
  }

  async getClassOverview(actor: ReportActor, classIdInput: string) {
    const classId = Number(classIdInput);
    if (!Number.isFinite(classId)) throw new ApiError(400, 'Invalid classId');

    const inputs = await this.classroom.getClassReportInputs(classId);

    // The legacy flow checked ownership *before* existence for a teacher: a teacher asking about a
    // class that does not exist got 403, and one asking about a colleague's class got 403 too. The
    // port returns `class: null` for both, so the two are distinguished only by the teacher branch.
    if (actor.role === 'teacher' && actor.id) {
      if (!inputs.class || inputs.class.teacher_id !== actor.id) {
        throw new ApiError(403, '无权限查看该班级分析');
      }
    }
    if (!inputs.class) throw new ApiError(404, 'Class not found');

    const { summary } = inputs;
    const praiseCount = await this.praiseCount((port) => port.countPraisesForClass(classId));

    return {
      class: inputs.class,
      summary: {
        total_students: summary.total_students,
        average_points: Math.round(Number(summary.average_points)),
        max_points: summary.max_points,
        min_points: summary.min_points,
        average_exam_score: Math.round(Number(summary.average_exam_score)),
        assignment_completion_rate: summary.total_assignment_records
          ? Math.round((summary.submitted_assignment_records / summary.total_assignment_records) * 100)
          : 0,
        attendance_rate: summary.total_attendance_records
          ? Math.round((summary.present_records / summary.total_attendance_records) * 100)
          : 0,
        praise_count: praiseCount,
        leave_count: await this.leaveCount(classId),
      },
      distributions: summary.distribution,
      exam_trend: inputs.exam_trend,
      assignment_trend: inputs.assignment_trend.map((item) => ({
        ...item,
        completion_rate: item.total_students ? Math.round((item.submitted_students / item.total_students) * 100) : 0,
      })),
      top_students: summary.top_students,
    };
  }

  /**
   * The class's leave-request count.
   *
   * The one number the report needs that classroom's report method does not carry: it counts
   * `leave_requests` rows, which classroom owns and declares. Rather than widen
   * `getClassReportInputs` for a single integer, the count is derived from the student ids the class
   * report already returned - the leave rows are filtered by student, and classroom's
   * `listClassStudents` is the port that produces them.
   */
  private async leaveCount(classId: number): Promise<number> {
    const students = await this.classroom.listClassStudents(classId);
    if (students.length === 0) return 0;
    return this.classroom.countLeaveRequestsForStudents(students.map((student) => student.id));
  }

  async getStudentReport(actor: ReportActor, studentIdInput: string) {
    const studentId = Number(studentIdInput);
    if (!Number.isFinite(studentId)) throw new ApiError(400, 'Invalid studentId');
    await this.assertStudentAccess(actor, studentId);

    const inputs = await this.classroom.getStudentReportInputs(studentId);
    if (!inputs.student) throw new ApiError(404, 'Student not found');

    const praises = await this.praiseSnippets(studentId, 5);
    const { assignment_summary: assignmentSummary, attendance } = inputs;

    return {
      student: {
        id: inputs.student.id,
        class_id: inputs.student.class_id,
        name: inputs.student.name,
        total_points: inputs.student.total_points,
      },
      summary: {
        weekly_earned: inputs.points.weekly_earned,
        weekly_spent: inputs.points.weekly_spent,
        total_earned: inputs.points.total_earned,
        total_spent: inputs.points.total_spent,
        average_exam_score: Math.round(Number(inputs.average_exam_score)),
        assignment_completion_rate: assignmentSummary.total_assignments
          ? Math.round((assignmentSummary.submitted_assignments / assignmentSummary.total_assignments) * 100)
          : 0,
        attendance_rate: attendance.total_records
          ? Math.round((attendance.present_count / attendance.total_records) * 100)
          : 0,
        praise_count: praises.length,
      },
      records: inputs.records,
      recent_exams: inputs.recent_exams,
      assignments: inputs.assignments,
      attendance: {
        total_records: attendance.total_records,
        present_count: attendance.present_count,
        late_count: attendance.late_count,
        absent_count: attendance.absent_count,
      },
      praises,
      // The newest five leave rows, which the student report shows. Classroom owns the table; the
      // port returns them already projected to the five columns the response carries.
      leaves: await this.classroom.listRecentLeaves(studentId, 5),
    };
  }

  async getStudentRadar(actor: ReportActor, studentIdInput: string) {
    const studentId = Number(studentIdInput);
    if (!Number.isFinite(studentId)) throw new ApiError(400, 'Invalid studentId');
    await this.assertStudentAccess(actor, studentId);

    const inputs = await this.classroom.getStudentReportInputs(studentId);
    if (!inputs.student) throw new ApiError(404, 'Student not found');

    const praiseCount = await this.praiseCount((port) => port.countPraisesForStudent(studentId));
    const { assignment_summary: assignmentSummary, attendance } = inputs;

    const metrics = {
      积分表现: Math.min(100, Math.max(0, inputs.student.total_points)),
      作业完成: assignmentSummary.total_assignments
        ? Math.round((assignmentSummary.submitted_assignments / assignmentSummary.total_assignments) * 100)
        : 0,
      考试成绩: Math.round(Number(inputs.average_exam_score)),
      出勤表现: attendance.total_records
        ? Math.round((attendance.present_count / attendance.total_records) * 100)
        : 0,
      教师表扬: Math.min(100, praiseCount * 20),
    };

    const metricEntries = Object.entries(metrics);
    const strengths = metricEntries.filter(([, value]) => value >= 75).map(([label]) => label);
    const weaknesses = metricEntries.filter(([, value]) => value < 60).map(([label]) => label);
    const advice = [
      metrics.作业完成 < 70 ? '优先提升作业按时提交率，减少遗漏任务。' : '继续保持稳定的作业完成节奏。',
      metrics.考试成绩 < 70 ? '建议围绕最近考试错题做集中复盘。' : '可以尝试更高难度练习巩固优势。',
      metrics.出勤表现 < 90 ? '关注迟到和缺勤原因，尽量保持稳定出勤。' : '保持良好出勤习惯，有利于持续进步。',
    ];

    return {
      report: {
        studentName: inputs.student.name,
        metrics,
        strengths,
        weaknesses,
        advice,
      },
    };
  }

  /** The praise snippets, or none when engagement is absent. */
  private async praiseSnippets(studentId: number, limit: number) {
    const port = this.engagement();
    if (!port) return [];
    const result = await port.listPraiseSnippetsForStudent(studentId, limit);
    if (result.refusal) throw refusalError(result.refusal);
    return result.value ?? [];
  }
}
