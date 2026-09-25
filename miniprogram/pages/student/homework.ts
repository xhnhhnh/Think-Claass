/**
 * 我的作业 - the list tab.
 *
 * Two sections rather than one list with a filter: a pupil opens this tab to answer "is there
 * anything I still have to do?", and that question deserves a section that is empty most of the
 * time. 待完成 comes first and holds exactly what `pages/student/homework-detail` can act on
 * (`draft` and `returned` submissions, plus homework with no submission yet); 已完成 holds the rest,
 * where the useful number is the score.
 *
 * The list itself is one call - `GET /api/homework/my` returns each row with the student's own
 * attempt attached - so this page never fans out per homework.
 */

import { requireSession } from '../../services/auth'
import { myHomework } from '../../services/homework'
import type { HomeworkStudentEntry } from '../../services/homework'
import { syncTabBar } from '../../utils/feature'
import { formatDueLabel, formatScore, submissionStatusText } from '../../utils/format'
import { errorMessage } from '../../utils/toast'

interface HomeworkCard {
  id: number
  title: string
  description: string
  dueText: string
  dueTone: string
  /** Kept for sorting only; the rendered form is `dueText`. */
  dueAt: string
  statusText: string
  statusTone: string
  questionCount: number
  rewardPoints: number
  scoreText: string
  feedback: string
  /** `returned` papers deserve a louder treatment than a fresh one: the teacher is waiting. */
  returned: boolean
}

Page({
  data: {
    loading: true,
    /** True only for the first load, so a return to the tab does not flash a skeleton. */
    firstLoad: true,
    error: '',
    pending: [] as HomeworkCard[],
    done: [] as HomeworkCard[],
  },

  onLoad() {
    requireSession()
  },

  onShow() {
    void syncTabBar(this)
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
      const entries = await myHomework()
      const pending: HomeworkCard[] = []
      const done: HomeworkCard[] = []
      for (const entry of entries) {
        const card = toCard(entry)
        if (isOpen(entry)) {
          pending.push(card)
        } else {
          done.push(card)
        }
      }
      pending.sort(byDueDate)
      done.sort(byDueDate)
      this.setData({ loading: false, firstLoad: false, error: '', pending, done })
    } catch (error) {
      this.setData({ loading: false, firstLoad: false, error: errorMessage(error) })
    }
  },

  onCardTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const id = event.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/student/homework-detail?id=${id}` })
    }
  },

  onRetry() {
    void this.load()
  },
})

/** Everything the student can still act on. Mirrors the same predicate on the home tab. */
function isOpen(entry: HomeworkStudentEntry): boolean {
  if (entry.homework.status === 'closed') {
    return false
  }
  if (!entry.submission) {
    return true
  }
  return entry.submission.status === 'draft' || entry.submission.status === 'returned'
}

function toCard(entry: HomeworkStudentEntry): HomeworkCard {
  const due = formatDueLabel(entry.homework.due_at)
  const submission = entry.submission
  const status = submission ? submission.status : ''
  return {
    id: entry.homework.id,
    title: entry.homework.title,
    description: entry.homework.description || '',
    dueText: due.text,
    dueTone: due.tone,
    dueAt: entry.homework.due_at || '',
    statusText: statusTextOf(status, entry.homework.status),
    statusTone: statusToneOf(status),
    questionCount: entry.question_count,
    rewardPoints: entry.homework.reward_points,
    scoreText: submission && submission.status === 'graded' ? formatScore(submission.score, submission.total_points) : '',
    feedback: submission && submission.teacher_feedback ? submission.teacher_feedback : '',
    returned: status === 'returned',
  }
}

function statusTextOf(submissionStatus: string, homeworkStatus: string): string {
  if (submissionStatus) {
    return submissionStatusText(submissionStatus)
  }
  return homeworkStatus === 'closed' ? '已结束 · 未提交' : '未开始'
}

function statusToneOf(submissionStatus: string): string {
  switch (submissionStatus) {
    case 'draft':
      return 'warn'
    case 'returned':
      return 'danger'
    case 'submitted':
      return 'info'
    case 'graded':
      return 'success'
    default:
      return 'muted'
  }
}

/**
 * Deadline first, undated last.
 *
 * Both sides are SQLite's `YYYY-MM-DD HH:mm:ss`, which sorts correctly as a string; homework with
 * no deadline goes to the bottom because it can be done any time, and mixing it in by id would bury
 * today's work under next month's.
 */
function byDueDate(left: HomeworkCard, right: HomeworkCard): number {
  if (!left.dueAt && !right.dueAt) {
    return right.id - left.id
  }
  if (!left.dueAt) {
    return 1
  }
  if (!right.dueAt) {
    return -1
  }
  return left.dueAt.localeCompare(right.dueAt)
}
