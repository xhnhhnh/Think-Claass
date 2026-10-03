/**
 * 成长足迹 - the parent's window into what the teacher recorded.
 *
 * ## One read, three kinds of answer
 *
 * `childReport(studentId)` is the page's only request, and it answers in one of three shapes that
 * must not be blurred together:
 *
 *   - a report: eight summary numbers plus up to twenty ledger rows, oldest data or none at all;
 *   - a refusal - the deployment's 家长报告 switch is off, or the account is no longer linked to the
 *     child, and the route answers 403. That is 「老师还没有开放成长报告」, **not** a network error;
 *   - anything else (offline, 500): a real failure, with the server's own sentence and a retry.
 *
 * A refusal is read from `ApiError.status` rather than from the message text: the gate and the
 * access check are the same status on purpose (家庭时光 answers 403 for its own flag the same way),
 * and matching Chinese substrings would break the first time the server rewords a sentence.
 *
 * ## Every number is optional
 *
 * `StudentReportDto` types the envelope loosely, and a fresh deployment answers zeros for a child
 * with no history. A missing key must read as `0` in a stat cell rather than as `undefined`, so
 * `toSummary` is the one place that normalises the eight fields.
 *
 * ## The three bars are not all the same kind of number
 *
 * `assignment_completion_rate` and `attendance_rate` are percentages by construction (the report
 * divides and rounds server-side), so they print with a `%` and can fill a bar as they are.
 * `average_exam_score` is a raw average mark - the web prints the bare number - so its bar is
 * clamped to 0-100 while the number beside it stays exactly what the server said.
 *
 * ## Why there is no 学段/等级 line
 *
 * The response carries `class_id`, which is a database key rather than a grade, and nothing else
 * that names the child's year. The header is therefore the child's name and no invented label.
 */

import { requireSession } from '../../services/auth'
import { childReport } from '../../services/parent'
import type { StudentReportDto } from '../../services/parent'
import { syncTabBar } from '../../utils/feature'
import { formatDateTime, formatDelta } from '../../utils/format'
import { studentIdOf } from '../../utils/storage'
import { errorMessage } from '../../utils/toast'

/** The eight numbers `summary` carries. All of them are optional on the wire. */
interface ReportSummary {
  weekly_earned?: unknown
  weekly_spent?: unknown
  total_earned?: unknown
  total_spent?: unknown
  average_exam_score?: unknown
  assignment_completion_rate?: unknown
  attendance_rate?: unknown
  praise_count?: unknown
}

/**
 * One row of `records` as the server projects it.
 *
 * `{ id, type, amount, description, created_at }` - the route's own shape, which is not the shape of
 * the points ledger on the student routes (`points` / `reason` there). Reading the wrong pair would
 * render an empty description and a zero amount for every row.
 */
interface ReportRecord {
  id?: unknown
  type?: unknown
  amount?: unknown
  description?: unknown
  created_at?: unknown
}

const EMPTY_SUMMARY = {
  weeklyEarned: 0,
  weeklySpent: 0,
  totalEarned: 0,
  totalSpent: 0,
  averageExamScore: 0,
  assignmentCompletionRate: 0,
  attendanceRate: 0,
  praiseCount: 0,
}

type SummaryNumbers = typeof EMPTY_SUMMARY

interface StatItem {
  label: string
  /** Already a string: the template does no arithmetic, and a unit sits beside it. */
  value: string
  unit: string
}

interface BarItem {
  label: string
  text: string
  /** 0-100, ready for `style="width: …%"`. */
  percent: number
}

interface RecordRow {
  id: number
  title: string
  amountText: string
  tone: 'up' | 'down'
  when: string
}

/** The two non-report states, which are explanations rather than failures. */
interface Notice {
  title: string
  hint: string
  retry: boolean
}

const NO_CHILD_NOTICE: Notice = {
  title: '还没有绑定孩子',
  hint: '这个账号还没有关联学生，暂时看不到成长报告。请联系老师获取邀请码完成绑定。',
  retry: false,
}

const REPORT_CLOSED_NOTICE: Notice = {
  title: '老师还没有开放成长报告',
  hint: '成长报告由老师统一开启。如果这个账号刚换了班级，稍后再试一次，或联系老师确认绑定。',
  retry: true,
}

Page({
  data: {
    loading: true,
    /** True only for the first load, so a return to the tab does not flash a skeleton. */
    firstLoad: true,
    /** The child this session reads for; `0` when the account has none. */
    studentId: 0,
    /** A real failure: the server's sentence, or the transport's. */
    error: '',
    /** A refusal or an unlinked account: an explanation, not an error. */
    notice: null as Notice | null,
    childName: '',
    stats: [] as StatItem[],
    bars: [] as BarItem[],
    records: [] as RecordRow[],
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({ studentId: studentIdOf(session.user) || 0 })
  },

  onShow() {
    // The session check comes first: a page still on the stack after the token was cleared must not
    // fire a doomed request and paint an error card over a redirect to the login page.
    if (!requireSession()) {
      return
    }
    void syncTabBar(this)
    // The teacher may have graded something while the parent was on another tab, so a return to this
    // page re-reads the report - quietly, without the skeleton.
    void this.load({ silent: !this.data.firstLoad })
  },

  onPullDownRefresh() {
    void this.load({ silent: true }).then(() => wx.stopPullDownRefresh())
  },

  async load(options: { silent?: boolean } = {}) {
    const studentId = this.data.studentId
    if (!studentId) {
      this.setData({ loading: false, firstLoad: false, error: '', notice: NO_CHILD_NOTICE })
      return
    }
    if (!options.silent) {
      this.setData({ loading: true })
    }

    try {
      const report = await childReport(studentId)
      const summary = toSummary(report.summary as ReportSummary | undefined)
      this.setData({
        loading: false,
        firstLoad: false,
        error: '',
        notice: null,
        childName: report.student && report.student.name ? report.student.name : '',
        stats: buildStats(summary),
        bars: buildBars(summary),
        records: toRecords(report.records),
      })
    } catch (error) {
      const refused = (error as { status?: number }).status === 403
      this.setData({
        loading: false,
        firstLoad: false,
        notice: refused ? REPORT_CLOSED_NOTICE : null,
        error: refused ? '' : errorMessage(error),
      })
    }
  },

  onRetry() {
    void this.load()
  },
})

/** SQLite hands a numeric back as either a number or a string; anything else reads as 0. */
function numberOrZero(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

function toSummary(raw: ReportSummary | undefined): SummaryNumbers {
  const source = raw || {}
  return {
    weeklyEarned: numberOrZero(source.weekly_earned),
    weeklySpent: numberOrZero(source.weekly_spent),
    totalEarned: numberOrZero(source.total_earned),
    totalSpent: numberOrZero(source.total_spent),
    averageExamScore: numberOrZero(source.average_exam_score),
    assignmentCompletionRate: numberOrZero(source.assignment_completion_rate),
    attendanceRate: numberOrZero(source.attendance_rate),
    praiseCount: numberOrZero(source.praise_count),
  }
}

/** The eight cells, in the order a parent reads them: this week, all time, then the three rates. */
function buildStats(summary: SummaryNumbers): StatItem[] {
  return [
    { label: '本周获得', value: String(summary.weeklyEarned), unit: '分' },
    { label: '本周使用', value: String(summary.weeklySpent), unit: '分' },
    { label: '累计获得', value: String(summary.totalEarned), unit: '分' },
    { label: '累计使用', value: String(summary.totalSpent), unit: '分' },
    { label: '平均考试分', value: String(summary.averageExamScore), unit: '分' },
    { label: '作业完成率', value: String(summary.assignmentCompletionRate), unit: '%' },
    { label: '出勤率', value: String(summary.attendanceRate), unit: '%' },
    { label: '获得表扬', value: String(summary.praiseCount), unit: '次' },
  ]
}

function buildBars(summary: SummaryNumbers): BarItem[] {
  return [
    // A mark, not a percentage: the printed value is the server's number untouched.
    { label: '平均考试分', text: `${summary.averageExamScore} 分`, percent: clampPercent(summary.averageExamScore) },
    { label: '作业完成率', text: `${summary.assignmentCompletionRate}%`, percent: clampPercent(summary.assignmentCompletionRate) },
    { label: '出勤率', text: `${summary.attendanceRate}%`, percent: clampPercent(summary.attendanceRate) },
  ]
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * The ledger rows the route returned, in its own order: `ORDER BY created_at DESC LIMIT 20`, newest
 * first, so nothing is re-sorted or re-sliced here.
 */
function toRecords(raw: unknown): RecordRow[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return (raw as ReportRecord[]).map((record) => {
    const amount = numberOrZero(record.amount)
    const description = typeof record.description === 'string' ? record.description.trim() : ''
    const type = typeof record.type === 'string' ? record.type : ''
    return {
      id: numberOrZero(record.id),
      // The description is the human sentence; an unknown type stands in rather than rendering blank.
      title: description || type || '积分变动',
      amountText: formatDelta(amount),
      tone: amount < 0 ? 'down' : 'up',
      when: typeof record.created_at === 'string' ? formatDateTime(record.created_at) : '',
    }
  })
}
