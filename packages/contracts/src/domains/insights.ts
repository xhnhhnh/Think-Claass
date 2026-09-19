/**
 * insights domain contracts.
 *
 * This is the reporting domain: class overview, student report and student radar - three read-only
 * routes over data every other domain owns. HANDOFF section 8.9 called it "not a domain you can move
 * on its own; it is a cross-domain read model" and deferred it until the domains it reads had ports.
 * They do now (P4.3b.1 - P4.3b.10), and this file is the shape those ports take.
 *
 * ## Why the report types live here rather than in `classroom.ts`
 *
 * The obvious alternative is to name the shared interfaces after the table each query touches
 * `ClassPointSummary`, `ClassAttendanceSummary` - and let insights assemble the response. That was
 * rejected because it publishes classroom's *storage* shape: `total_students` and `present_records`
 * are columns of an aggregate, not a contract, and a second consumer would start depending on them.
 *
 * These types instead describe what a report *is*. `classroom` computes most of them (it owns the
 * rows), `engagement` supplies the praise count and the praise snippets, and insights adds the
 * derived numbers (rates, trends, radar metrics). The types are declarations, so guardrail G6 keeps
 * them runtime-free - the producing plugin imports them, it does not extend them.
 *
 * Type-only, like every contracts module.
 */

/** The class a report is about, as the response embeds it. */
export interface ReportClass {
  id: number;
  name: string;
  teacher_id: number;
}

/** One bar of the point distribution chart. */
export interface PointDistributionBucket {
  label: string;
  value: number;
}

/** Averages and counts behind the class overview's summary block. */
export interface ClassSummaryInputs {
  total_students: number;
  average_points: number;
  max_points: number;
  min_points: number;
  average_exam_score: number;
  /** Raw counts, not rates: the rate is `submitted / total`, and rounding is presentation. */
  total_assignment_records: number;
  submitted_assignment_records: number;
  total_attendance_records: number;
  present_records: number;
  distribution: PointDistributionBucket[];
  /** Top five by points, already decrypted, in the order the response shows them. */
  top_students: Array<{ id: number; name: string; total_points: number }>;
}

/** One exam in the trend chart. */
export interface ExamTrendPoint {
  id: number;
  title: string;
  exam_date: string | null;
  average_score: number;
}

/** One assignment in the trend chart, with its raw counts. */
export interface AssignmentTrendPoint {
  id: number;
  title: string;
  due_date: string | null;
  total_students: number;
  submitted_students: number;
}

/** Everything the class overview needs from classroom, in one call. */
export interface ClassReportInputs {
  /** `null` when the class does not exist; the caller answers the legacy 404. */
  class: ReportClass | null;
  summary: ClassSummaryInputs;
  exam_trend: ExamTrendPoint[];
  assignment_trend: AssignmentTrendPoint[];
}

/** One ledger row for the student report. */
export interface StudentLedgerRow {
  id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

/** Point totals, all-time and for the last seven days. */
export interface StudentPointTotals {
  weekly_earned: number;
  weekly_spent: number;
  total_earned: number;
  total_spent: number;
}

/** One exam result for the student report. */
export interface StudentExamRow {
  title: string;
  exam_date: string | null;
  total_score: number | null;
  score: number | null;
  feedback: string | null;
}

/** One assignment result for the student report. */
export interface StudentAssignmentRow {
  title: string;
  due_date: string | null;
  status: string;
  score: number | null;
  teacher_feedback: string | null;
}

/** Attendance counts behind both the report and the radar. */
export interface StudentAttendanceSummary {
  total_records: number;
  present_count: number;
  late_count: number;
  absent_count: number;
}

/** Assignment counts behind both the report and the radar. */
export interface StudentAssignmentSummary {
  total_assignments: number;
  submitted_assignments: number;
}

/**
 * Everything the student report **and** radar need from classroom, in one call.
 *
 * Both routes read the same five summaries and differ only in what they project, so one method
 * serves them: two methods would duplicate the queries, and a report/radar divergence would then be
 * a silent difference between two screens that are supposed to agree.
 *
 * `student` is `null` when no such row exists, which is the legacy 404. `name` is decrypted.
 */
export interface StudentReportInputs {
  student: { id: number; user_id: number | null; class_id: number; name: string; total_points: number } | null;
  points: StudentPointTotals;
  /** The newest 20 ledger rows, newest first. */
  records: StudentLedgerRow[];
  /** The newest 6 graded exams, newest first. */
  recent_exams: StudentExamRow[];
  /** The newest 6 assignments by submission date, newest first. */
  assignments: StudentAssignmentRow[];
  assignment_summary: StudentAssignmentSummary;
  average_exam_score: number;
  attendance: StudentAttendanceSummary;
}

/**
 * The report-shaped view of a student, for the access check.
 *
 * `insights` has to answer "may this actor see this student's report", and the answer depends on
 * rows classroom owns (the student's class and its teacher, the student's own user id) plus one
 * engagement-owned count. It used to run four different queries for that - a `students JOIN classes`,
 * a `parent_students` lookup and two more - from a module that owned none of those tables.
 */
export interface StudentAccessView {
  studentId: number;
  /** `null` when the student has no linked login. */
  userId: number | null;
  classId: number;
  teacherId: number | null;
}

export type InsightsRefusalCode = 'student-not-found' | 'class-not-found' | 'forbidden';

export interface InsightsRefusal {
  code: InsightsRefusalCode;
  message: string;
}

/** `value` absent means refused; see `ClassroomResult` for why this is not a discriminated union. */
export interface InsightsResult<T> {
  value?: T;
  refusal?: InsightsRefusal;
}
