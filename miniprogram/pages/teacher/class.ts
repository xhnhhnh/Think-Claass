/**
 * 班级 - the teacher's roster and the classroom's most-used write.
 *
 * ## One page, because that is how the job is done
 *
 * A teacher standing in front of a class picks names, taps a preset reason, presses 加分. Making the
 * roster one screen and the batch write another would mean carrying a selection across a navigation,
 * so the selection *is* the page: the roster rows are the checkboxes, the write bar is pinned above
 * the tab bar, and the whole errand is three taps.
 *
 * ## Why `amount` is signed
 *
 * `POST /api/students/batch-points` takes `{ studentIds, amount, reason }` where a negative `amount`
 * is a deduction - one route, one ledger entry per student, one audit trail. The page therefore has a
 * 加/减 toggle that decides the sign, rather than two endpoints or two buttons that could disagree.
 *
 * ## This page is a tab bar host, not a tab page
 *
 * `pages/teacher/*` cannot be in `app.json`'s `tabBar.list` (WeChat caps the list at five entries and
 * the student set already holds four - see `utils/feature.ts`), so the tab bar is rendered here by
 * hand under `#tab-bar` and navigated with `redirectTo`. `syncTabBar(this)` in `onShow` finds it
 * either way.
 */

import { requireSession } from '../../services/auth'
import { batchPoints, listStudents } from '../../services/teacher'
import type { StudentDto } from '../../services/teacher'
import { syncTabBar } from '../../utils/feature'
import { classIdOf } from '../../utils/storage'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface StudentView extends StudentDto {
  selected: boolean
}

/** The four reasons that cover most of a school day; the input stays for the rest. */
const PRESET_REASONS = ['课堂表现好', '作业完成好', '帮助同学', '需要改进']

Page({
  data: {
    loading: true,
    error: '',
    classId: null as number | null,
    students: [] as StudentView[],
    selectedCount: 0,
    /** `add` or `minus` - only the sign of the payload changes. */
    mode: 'add',
    amount: '1',
    reason: '',
    presets: PRESET_REASONS,
    submitting: false,
    /** The class's average, shown as a one-line summary above the roster. */
    averagePoints: 0,
  },

  teacherId: 0,

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.teacherId = session.user.id
    this.setData({ classId: classIdOf(session.user) })
    void this.load()
  },

  onShow() {
    void syncTabBar(this)
    // Coming back from 作业 or 智学看板: the roster may have moved. Quiet reload, no skeleton.
    if (!this.data.loading) {
      void this.load({ silent: true })
    }
  },

  onPullDownRefresh() {
    void this.load({ silent: true }).then(() => wx.stopPullDownRefresh())
  },

  async load(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      // No `classId` when the account has none: the server then answers every student the actor owns,
      // which is the honest answer for an unassigned teacher (and for an admin).
      const students = await listStudents(this.data.classId)
      const views = students.map((student) => ({ ...student, selected: false }))
      let total = 0
      for (const student of views) {
        total += student.total_points
      }
      this.setData({
        loading: false,
        error: '',
        students: views,
        selectedCount: 0,
        averagePoints: views.length ? Math.round(total / views.length) : 0,
      })
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  onToggleStudent(event: { currentTarget: { dataset: Record<string, string> } }) {
    const id = Number(event.currentTarget.dataset.id)
    const students = this.data.students.map((student) => (student.id === id ? { ...student, selected: !student.selected } : student))
    this.setData({ students, selectedCount: countSelected(students) })
  },

  onToggleAll() {
    const allSelected = this.data.selectedCount === this.data.students.length && this.data.students.length > 0
    const students = this.data.students.map((student) => ({ ...student, selected: !allSelected }))
    this.setData({ students, selectedCount: countSelected(students) })
  },

  onModeTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const mode = event.currentTarget.dataset.mode
    if (mode === 'add' || mode === 'minus') {
      this.setData({ mode })
    }
  },

  onAmountInput(event: { detail: { value: string } }) {
    this.setData({ amount: event.detail.value })
  },

  onReasonInput(event: { detail: { value: string } }) {
    this.setData({ reason: event.detail.value })
  },

  onPresetTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    this.setData({ reason: event.currentTarget.dataset.reason || '' })
  },

  async onSubmit() {
    const selected = this.data.students.filter((student) => student.selected)
    const amount = Math.abs(Number(this.data.amount))
    const reason = this.data.reason.trim()

    if (!selected.length) {
      toastError('请先选择学生')
      return
    }
    if (!amount || Number.isNaN(amount)) {
      toastError('请填写分值')
      return
    }
    if (!reason) {
      toastError('请填写原因')
      return
    }

    const sign = this.data.mode === 'minus' ? -1 : 1
    const confirmed = await confirm({
      title: this.data.mode === 'minus' ? '批量减分' : '批量加分',
      content: `为 ${selected.length} 名学生${this.data.mode === 'minus' ? '减' : '加'} ${amount} 分？原因：${reason}`,
      confirmText: '确定',
      danger: this.data.mode === 'minus',
    })
    if (!confirmed || this.data.submitting) {
      return
    }

    this.setData({ submitting: true })
    try {
      const result = await batchPoints({
        studentIds: selected.map((student) => student.id),
        amount: sign * amount,
        reason,
      })
      toastSuccess(result.message)
      this.setData({ reason: '' })
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

function countSelected(students: StudentView[]): number {
  let count = 0
  for (const student of students) {
    if (student.selected) {
      count += 1
    }
  }
  return count
}
