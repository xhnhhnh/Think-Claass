/**
 * 请假假条 - the parent's leave form, and the record of what they have already filed.
 *
 * ## One page, because the list is the form's context
 *
 * A parent writes a leave note while looking at the ones already filed - "is the last one still
 * 老师查看中?" - so the form sits above the list instead of behind a navigation. The web's parent
 * page puts the same two things on one screen (form in a dialog, records below).
 *
 * ## Why there is no 病假/事假 picker
 *
 * `leave_requests` has no `type` column and the create route reads exactly four fields
 * (`student_id`, `start_date`, `end_date`, `reason`). A category selector would be asking the parent
 * for something the server has nowhere to store, and the teacher's approval screen would never show
 * it - so the honest form is a date range and a reason.
 *
 * ## The child is never a field
 *
 * `student_id` comes from the session (`studentIdOf`). The route only accepts a leave for the actor's
 * own child and records the submitting parent as the actor, so a picker here would be a list of
 * exactly one, and any other value could only produce a refusal.
 *
 * ## Approving is the teacher's job
 *
 * There is deliberately no approve/reject control: `PUT` on the leave route requires the class
 * teacher. A parent sees the decision and the teacher's note, never makes it.
 */

import { requireSession } from '../../services/auth'
import { createLeave, myLeaves } from '../../services/parent'
import type { LeaveDto } from '../../services/parent'
import { syncTabBar } from '../../utils/feature'
import { formatDate, formatDateTime } from '../../utils/format'
import { studentIdOf } from '../../utils/storage'
import { errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface LeaveView {
  id: number
  /** The two ends as one line (`5月6日 至 5月8日`), or a single day when they are equal. */
  range: string
  reason: string
  statusText: string
  statusTone: string
  reviewComment: string
  createdText: string
  /** Kept for sorting only; the rendered forms are `range` and `createdText`. */
  createdAt: string
}

Page({
  data: {
    loading: true,
    /** True only for the first load, so coming back to the page does not flash a skeleton. */
    firstLoad: true,
    error: '',
    /** The child this session files for; `0` when the account has none (see `onSubmit`). */
    studentId: 0,
    leaves: [] as LeaveView[],
    startDate: '',
    endDate: '',
    reason: '',
    /** `YYYY-MM-DD`; the end picker's lower bound so an inverted range cannot be picked. */
    today: '',
    submitting: false,
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({ today: todayString(), studentId: studentIdOf(session.user) || 0 })
  },

  onShow() {
    // The session check comes first: a page still on the stack after the token was cleared must not
    // fire a doomed request and paint an error card over a redirect to the login page.
    if (!requireSession()) {
      return
    }
    void syncTabBar(this)
    // The teacher may have approved something while the parent was on another tab, so a return to
    // this page re-reads the list - quietly, without the skeleton.
    void this.load({ silent: !this.data.firstLoad })
  },

  onPullDownRefresh() {
    void this.load({ silent: true }).then(() => wx.stopPullDownRefresh())
  },

  async load(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      // No `studentId` in the query: the route already scopes the answer to the parent's own
      // children, and `myLeaves()` unwraps the `data` envelope this endpoint actually uses.
      const leaves = await myLeaves()
      this.setData({
        loading: false,
        firstLoad: false,
        error: '',
        leaves: leaves.map(toView).sort(byNewest),
      })
    } catch (error) {
      this.setData({ loading: false, firstLoad: false, error: errorMessage(error) })
    }
  },

  onStartDateChange(event: { detail: { value: string } }) {
    this.setData({ startDate: event.detail.value })
  },

  onEndDateChange(event: { detail: { value: string } }) {
    this.setData({ endDate: event.detail.value })
  },

  onReasonInput(event: { detail: { value: string } }) {
    this.setData({ reason: event.detail.value })
  },

  async onSubmit() {
    const studentId = this.data.studentId
    const startDate = this.data.startDate
    const endDate = this.data.endDate
    const reason = this.data.reason.trim()

    if (!studentId) {
      toastError('账号里还没有孩子的信息，请联系老师')
      return
    }
    if (!startDate || !endDate) {
      toastError('请选择开始和结束日期')
      return
    }
    /**
     * Both values come from `<picker mode="date">` as `YYYY-MM-DD`, so comparing them as strings
     * *is* comparing them as dates - and it avoids `new Date('2026-05-06')`, which is `Invalid Date`
     * on iOS (see `utils/format.ts`). The picker's own `start` bound cannot be trusted to keep the
     * range sane: a parent can pick the end date first and then move the start past it.
     */
    if (endDate < startDate) {
      toastError('结束日期不能早于开始日期')
      return
    }
    if (!reason) {
      toastError('请填写请假事由')
      return
    }
    if (this.data.submitting) {
      return
    }

    this.setData({ submitting: true })
    try {
      await createLeave({ student_id: studentId, start_date: startDate, end_date: endDate, reason })
      toastSuccess('假条已经交给老师啦')
      this.setData({ startDate: '', endDate: '', reason: '' })
      // The server stamps the row's id, status and creation time, so the list is re-read rather than
      // patched with a locally invented row.
      await this.load({ silent: true })
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ submitting: false })
    }
  },

  onRetry() {
    void this.load()
  },
})

function toView(leave: LeaveDto): LeaveView {
  const start = formatDate(leave.start_date)
  const end = formatDate(leave.end_date)
  return {
    id: leave.id,
    range: start === end ? start : `${start} 至 ${end}`,
    reason: leave.reason || '',
    statusText: statusTextOf(leave.status),
    statusTone: statusToneOf(leave.status),
    reviewComment: leave.review_comment || '',
    createdText: leave.created_at ? formatDateTime(leave.created_at) : '',
    createdAt: leave.created_at || '',
  }
}

/**
 * The four words a parent reads, not the enum.
 *
 * `pending` / `approved` / `rejected` are the server's; 「老师查看中」/「老师已同意」/「需要再沟通」
 * are what the web prints for the same three states, and the two clients must not drift into telling
 * a family two different stories about one decision.
 */
function statusTextOf(status: string): string {
  switch (status) {
    case 'approved':
      return '老师已同意'
    case 'rejected':
      return '需要再沟通'
    case 'pending':
      return '老师查看中'
    default:
      return status || '待确认'
  }
}

function statusToneOf(status: string): string {
  switch (status) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'danger'
    case 'pending':
      return 'info'
    default:
      return 'muted'
  }
}

/** Newest first: the note just filed is the one the parent wants to check on. */
function byNewest(left: LeaveView, right: LeaveView): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1
  }
  return right.id - left.id
}

/** `YYYY-MM-DD` for the date picker's bound. */
function todayString(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  return `${now.getFullYear()}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`
}
