/**
 * 作业 - the teacher's list, a publish form, and the grade sheet, in one screen.
 *
 * ## What this page deliberately does not do
 *
 * It publishes a *paper-less* homework: a title, a description, a deadline and a reward. Writing
 * questions (with options, reference answers, an answer key and AI 出题) is a long, keyboard-heavy
 * form that the web console owns - a phone is the wrong place for it, and a half-capable question
 * editor here would produce papers the web could not fix. A teacher on a phone can still set the
 * task and the deadline, which is the part that has to happen today.
 *
 * ## The grade sheet is inline
 *
 * `GET /api/homework/:id/submissions` is loaded on demand per row and rendered under it, rather than
 * on a separate page: the teacher's question is "who handed it in?", asked while looking at the list,
 * and an expand answers it without losing the list's scroll position.
 */

import { requireSession } from '../../services/auth'
import { createHomework, listHomework, listSubmissions } from '../../services/teacher'
import type { HomeworkGradeRow, HomeworkListEntry } from '../../services/homework'
import { syncTabBar } from '../../utils/feature'
import { classIdOf } from '../../utils/storage'
import { formatDueLabel, formatScore, homeworkStatusText, submissionStatusText } from '../../utils/format'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface HomeworkView {
  id: number
  title: string
  description: string
  statusText: string
  statusTone: string
  dueText: string
  dueTone: string
  questionCount: number
  rewardPoints: number
  /** True while this row's grade sheet is rendered underneath it. */
  expanded: boolean
  sheetLoading: boolean
  rows: GradeRowView[]
}

interface GradeRowView {
  submissionId: number
  studentName: string
  statusText: string
  statusTone: string
  scoreText: string
  submittedText: string
}

Page({
  data: {
    loading: true,
    error: '',
    classId: null as number | null,
    list: [] as HomeworkView[],
    // publish form
    showForm: false,
    title: '',
    description: '',
    dueDate: '',
    dueTime: '20:00',
    rewardPoints: '5',
    today: '',
    submitting: false,
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({
      classId: classIdOf(session.user),
      today: todayString(),
    })
    void this.load()
  },

  onShow() {
    void syncTabBar(this)
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
      const entries = await listHomework()
      const previous = this.data.list
      const list = entries.map((entry) => {
        // Keep an expanded row expanded (and its already-loaded sheet) across a refresh: the teacher
        // is reading it, and collapsing it under them would lose their place.
        const open = previous.filter((item) => item.id === entry.id)[0]
        return toView(entry, open ? open.expanded : false, open ? open.rows : [])
      })
      this.setData({ loading: false, error: '', list })
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  // ------------------------------------------------------------------ grade sheet

  async onToggleSheet(event: { currentTarget: { dataset: Record<string, string> } }) {
    const id = Number(event.currentTarget.dataset.id)
    const list = this.data.list
    const target = list.filter((item) => item.id === id)[0]
    if (!target) {
      return
    }

    if (target.expanded) {
      target.expanded = false
      this.setData({ list })
      return
    }

    target.expanded = true
    target.sheetLoading = true
    this.setData({ list })

    try {
      const rows = await listSubmissions(id)
      target.rows = rows.map(toGradeRow)
      target.sheetLoading = false
      this.setData({ list })
    } catch (error) {
      target.sheetLoading = false
      this.setData({ list })
      toastError(errorMessage(error))
    }
  },

  // ------------------------------------------------------------------ publish

  onToggleForm() {
    this.setData({ showForm: !this.data.showForm })
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ title: event.detail.value })
  },

  onDescriptionInput(event: { detail: { value: string } }) {
    this.setData({ description: event.detail.value })
  },

  onRewardInput(event: { detail: { value: string } }) {
    this.setData({ rewardPoints: event.detail.value })
  },

  onDateChange(event: { detail: { value: string } }) {
    this.setData({ dueDate: event.detail.value })
  },

  onTimeChange(event: { detail: { value: string } }) {
    this.setData({ dueTime: event.detail.value })
  },

  async onCreate() {
    const title = this.data.title.trim()
    if (!title) {
      toastError('请填写作业标题')
      return
    }
    if (this.data.classId === null) {
      toastError('当前账号还没有班级，无法发布作业')
      return
    }
    if (this.data.submitting) {
      return
    }

    const dueAt = this.data.dueDate ? `${this.data.dueDate} ${this.data.dueTime || '20:00'}:00` : null
    const confirmed = await confirm({
      title: '发布作业',
      content: dueAt ? `作业「${title}」将于 ${this.data.dueDate} ${this.data.dueTime} 截止，确定发布吗？` : `发布作业「${title}」？`,
      confirmText: '发布',
    })
    if (!confirmed) {
      return
    }

    this.setData({ submitting: true })
    try {
      await createHomework({
        class_id: this.data.classId,
        title,
        description: this.data.description.trim() || null,
        due_at: dueAt,
        reward_points: Number(this.data.rewardPoints) || 0,
        status: 'published',
      })
      toastSuccess('作业已发布')
      this.setData({ showForm: false, title: '', description: '', dueDate: '', rewardPoints: '5' })
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

// ---------------------------------------------------------------------------

function toView(entry: HomeworkListEntry, expanded: boolean, rows: GradeRowView[]): HomeworkView {
  const due = formatDueLabel(entry.due_at)
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description || '',
    statusText: homeworkStatusText(entry.status),
    statusTone: entry.status === 'published' ? 'success' : 'muted',
    dueText: due.text,
    dueTone: due.tone,
    questionCount: entry.question_count,
    rewardPoints: entry.reward_points,
    expanded,
    sheetLoading: false,
    rows,
  }
}

function toGradeRow(row: HomeworkGradeRow): GradeRowView {
  const status = row.submission.status
  return {
    submissionId: row.submission.id,
    studentName: row.student_name,
    statusText: submissionStatusText(status),
    statusTone: status === 'graded' ? 'success' : status === 'submitted' ? 'info' : status === 'returned' ? 'danger' : 'muted',
    scoreText: status === 'graded' ? formatScore(row.submission.score, row.submission.total_points) : '',
    submittedText: row.submission.submitted_at ? row.submission.submitted_at.slice(0, 16) : '',
  }
}

/** `YYYY-MM-DD` for the date picker's `start`, so a past deadline cannot be chosen by accident. */
function todayString(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  return `${now.getFullYear()}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`
}
