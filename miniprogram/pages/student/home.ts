/**
 * 成长总览 - the student's landing tab.
 *
 * Three things in the order a pupil cares about them: how they are doing (the greeting and the four
 * growth dimensions), what they owe (homework that is still open, due first), and where else they
 * can go (the quick entries, each one gated by its own class feature).
 *
 * ## Why the quick entries are not a hardcoded grid
 *
 * 积分商城 and AI 智学 exist only when their flag is on, and 奖状 only while `enable_achievements` is.
 * Each entry is wrapped in `<feature-guard>`, so a class with a feature switched off sees a smaller
 * grid rather than a button that answers 403. The entries whose flag is off are *not* rendered at
 * all - a guard in "closed" mode is the right answer when a page is reached by link, and the wrong
 * one for a menu the user is browsing.
 */

import { requireSession } from '../../services/auth'
import { getActiveAnnouncement, getSummary } from '../../services/student'
import type { PublicAnnouncementDto, StudentMotivationSummary } from '../../services/student'
import { myHomework } from '../../services/homework'
import type { HomeworkStudentEntry } from '../../services/homework'
import type { ClassFeatureFlags } from '../../utils/storage'
import { studentIdOf } from '../../utils/storage'
import { getResolution, isEnabled, syncTabBar } from '../../utils/feature'
import { formatDate, formatDueLabel, submissionStatusText } from '../../utils/format'
import { errorMessage } from '../../utils/toast'

interface HomeworkPreview {
  id: number
  title: string
  dueText: string
  dueTone: string
  statusText: string
}

/** How many open homework rows the preview shows before it defers to the list tab. */
const PREVIEW_LIMIT = 3

Page({
  data: {
    loading: true,
    error: '',
    /** Name from the session; the summary endpoint has no name field. */
    name: '',
    greeting: '',
    studentId: null as number | null,
    summary: null as StudentMotivationSummary | null,
    announcement: null as PublicAnnouncementDto | null,
    todos: [] as HomeworkPreview[],
    openCount: 0,
    features: {} as ClassFeatureFlags,
    /** Which of the three guarded quick entries are on; `false` hides the entry entirely. */
    showShop: false,
    showAiStudy: false,
    showAchievements: false,
    today: '',
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({
      name: session.user.name || session.user.username,
      studentId: studentIdOf(session.user),
      greeting: buildGreeting(),
      today: formatDate(Date.now()),
    })
  },

  onShow() {
    // The tab bar is recomputed on every entry: a teacher may have switched 积分商城 off while the
    // app was in the background, and the bar is the first thing that would be wrong.
    void syncTabBar(this).then(() => this.applyFeatures())
    // `loading` guards the first paint; a return to the tab refreshes quietly so the page does not
    // flash a skeleton over data the student was just reading.
    if (!this.data.loading) {
      void this.load({ silent: true })
    }
  },

  onPullDownRefresh() {
    void this.load({ silent: true, force: true }).then(() => wx.stopPullDownRefresh())
  },

  /** Adopt the resolved flag map for the quick entries. */
  applyFeatures() {
    const resolution = getResolution()
    this.setData({
      features: resolution.features,
      showShop: isEnabled(resolution.features, 'enable_shop'),
      showAiStudy: isEnabled(resolution.features, 'enable_ai_study'),
      showAchievements: isEnabled(resolution.features, 'enable_achievements'),
    })
  },

  async load(options: { silent?: boolean; force?: boolean } = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    this.setData({ error: '' })

    // The two reads are independent, so a failure of one must not hide the other: the announcement
    // in particular is public and answers even when the student's own summary does not.
    const [summaryResult, announcementResult, homeworkResult] = await Promise.all([
      this.fetchSummary(),
      this.fetchAnnouncement(),
      this.fetchHomework(),
    ])

    this.setData({
      loading: false,
      summary: summaryResult.value,
      announcement: announcementResult.value,
      todos: homeworkResult.todos,
      openCount: homeworkResult.openCount,
      error: summaryResult.error || homeworkResult.error || '',
    })

    if (options.force) {
      this.applyFeatures()
    }
  },

  async fetchSummary(): Promise<{ value: StudentMotivationSummary | null; error: string }> {
    const studentId = this.data.studentId
    if (studentId === null) {
      return { value: null, error: '' }
    }
    try {
      return { value: await getSummary(studentId), error: '' }
    } catch (error) {
      return { value: null, error: errorMessage(error) }
    }
  },

  async fetchAnnouncement(): Promise<{ value: PublicAnnouncementDto | null; error: string }> {
    try {
      return { value: await getActiveAnnouncement(), error: '' }
    } catch (error) {
      // A missing announcement is not an error state for the page; it simply does not render.
      return { value: null, error: '' }
    }
  },

  async fetchHomework(): Promise<{ todos: HomeworkPreview[]; openCount: number; error: string }> {
    try {
      const entries = await myHomework()
      const open = entries.filter(isOpen)
      // Due first, and an entry with no deadline last: "anything is better than nothing to do".
      open.sort((left, right) => {
        const leftDue = left.homework.due_at ? 1 : 0
        const rightDue = right.homework.due_at ? 1 : 0
        if (leftDue !== rightDue) {
          return rightDue - leftDue
        }
        return String(left.homework.due_at || '').localeCompare(String(right.homework.due_at || ''))
      })
      return {
        todos: open.slice(0, PREVIEW_LIMIT).map(toPreview),
        openCount: open.length,
        error: '',
      }
    } catch (error) {
      return { todos: [], openCount: 0, error: errorMessage(error) }
    }
  },

  onTodoTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const id = event.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/student/homework-detail?id=${id}` })
    }
  },

  onGoHomework() {
    wx.switchTab({ url: '/pages/student/homework' })
  },

  onGoShop() {
    wx.switchTab({ url: '/pages/student/shop' })
  },

  onGoAiStudy() {
    wx.navigateTo({ url: '/pages/student/ai-study' })
  },

  onGoAchievements() {
    wx.switchTab({ url: '/pages/student/me' })
  },

  onRetry() {
    void this.load()
  },
})

/** Is this homework still something the student can act on? */
function isOpen(entry: HomeworkStudentEntry): boolean {
  if (entry.homework.status === 'closed') {
    return false
  }
  if (!entry.submission) {
    return true
  }
  // `returned` is "fix and hand in again"; `submitted`/`graded` are done from the student's side.
  return entry.submission.status === 'draft' || entry.submission.status === 'returned'
}

function toPreview(entry: HomeworkStudentEntry): HomeworkPreview {
  const due = formatDueLabel(entry.homework.due_at)
  const status = entry.submission ? submissionStatusText(entry.submission.status) : ''
  return {
    id: entry.homework.id,
    title: entry.homework.title,
    dueText: due.text,
    dueTone: due.tone,
    statusText: status || (entry.homework.due_at ? '' : '不限时间'),
  }
}

/** 早上好 / 下午好 / 晚上好 - the same three buckets the web dashboard uses. */
function buildGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) {
    return '夜深了'
  }
  if (hour < 12) {
    return '早上好'
  }
  if (hour < 18) {
    return '下午好'
  }
  return '晚上好'
}
