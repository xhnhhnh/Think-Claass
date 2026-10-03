/**
 * 家庭时光 - the small agreements a parent and child make, and the two taps that close one.
 *
 * ## The flag is checked on the page, not only in the tab bar
 *
 * `enable_family_tasks` keeps this entry out of the parent's tab bar (`utils/feature.ts`), but a page
 * can still be opened directly - a shared link, a session left on the stack while the teacher
 * switched the flag off. The route answers 403 in that case, and
 * `services/parent.ts#familyTasks` folds that refusal into `[]` on purpose, so the page reads the
 * flag itself and renders `<feature-guard>`. Without it the only thing a parent would ever see is
 * 「还没有约定」, which is the wrong sentence for "this class does not use family time".
 *
 * ## The two meanings of an empty list
 *
 * With the flag on, `[]` means what it says: nothing has been agreed yet, and the page says so. With
 * the flag off (or not yet resolved) the guard replaces the list entirely and names the reason. Those
 * are the only two readings available: the service swallows *every* failure, so a transport error is
 * indistinguishable from an empty list on this route, and the failures a parent can actually hit are
 * the two writes - create and review - which report themselves as toasts.
 *
 * ## 奖励 is the server's `points`
 *
 * `family_tasks` has a `points` column and the create route refuses a body without it
 * (`400 Missing required fields`). The row type and the write payload in `services/parent.ts` both
 * spell it `points`, and `points` is what this page sends and reads.
 *
 * ## Why the form has no 说明 field
 *
 * The table has no `description` column (`api/schema/legacyBootSchema.ts`), the create route reads
 * only `student_id` / `title` / `points`, and the web's 家庭时光 form collects exactly those two for
 * the same reason. A third input here could only be dropped on the floor: the parent would type a
 * note, the server would store nothing, and no row would ever show it again. The field belongs back
 * the day the table has somewhere to put it.
 *
 * ## 通过 does not pay out - yet
 *
 * On the web, approving a task also credits the child: it calls the student-points write with a
 * `family-task:<id>` request id, which the classroom service verifies against the approved row before
 * it moves a single point. This client has no parent-side points function (`services/parent.ts`
 * carries none, and the teacher's batch route refuses a parent), so the page records the decision and
 * stops there. Inventing that second write here would be exactly the client drift the two surfaces
 * are meant to avoid, so the gap is reported instead.
 *
 * ## What a parent decides here
 *
 * A task's status is the child's report and the parent's confirmation: `pending` is 进行中,
 * `completed` is the child saying it is done and the only state with a decision left, `approved` /
 * `rejected` are the parent's answer. The words are the ones the web prints for the same four states
 * - the two clients must not tell one family two different stories about one agreement.
 */

import { requireSession } from '../../services/auth'
import { createFamilyTask, familyTasks, reviewFamilyTask } from '../../services/parent'
import type { FamilyTaskDto } from '../../services/parent'
import { getResolution, resolveFeatures, syncTabBar } from '../../utils/feature'
import { formatDateTime } from '../../utils/format'
import type { ClassFeatureFlags } from '../../utils/storage'
import { studentIdOf } from '../../utils/storage'
import { errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface TaskView {
  id: number
  title: string
  /** The reward, in the client's own vocabulary (积分), not the web's 小红花. */
  points: number
  statusText: string
  statusTone: string
  /** `completed` - the only state the parent still has to answer. */
  reviewable: boolean
  createdText: string
}

Page({
  data: {
    /** The first resolution of the class flags; the page shows nothing until it has answered. */
    featuresReady: false,
    features: {} as ClassFeatureFlags,
    loading: true,
    error: '',
    /** The child this session agrees for; `0` when the account has none. */
    studentId: 0,
    tasks: [] as TaskView[],
    /** The inline form. `points` stays a string: it is what the input holds, not a number yet. */
    title: '',
    points: '',
    submitting: false,
    /** The task being approved or rejected, so a second tap cannot double-write. */
    reviewingId: 0,
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({ studentId: studentIdOf(session.user) || 0 })
    void this.bootstrap()
  },

  onShow() {
    if (!requireSession()) {
      return
    }
    void syncTabBar(this)
    // Coming back from 温馨家园: a task may have been completed in between, so the list is re-read
    // quietly. The `loading` check is what keeps the first open from firing this alongside
    // `bootstrap` - both would run, and the slower answer would win.
    if (!this.data.loading) {
      void this.load({ silent: true })
    }
  },

  onPullDownRefresh() {
    void this.load({ silent: true }).then(() => wx.stopPullDownRefresh())
  },

  /** Resolve the class flags first: they decide whether the page has a list or an explanation. */
  async bootstrap(options: { force?: boolean } = {}) {
    await resolveFeatures(options)
    this.applyFeatures()
    await this.load()
  },

  applyFeatures() {
    this.setData({ featuresReady: true, features: getResolution().features })
  },

  async load(options: { silent?: boolean } = {}) {
    if (!this.data.studentId) {
      this.setData({ loading: false })
      return
    }
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      // The route already orders newest first (`ORDER BY created_at DESC`), so the list is rendered
      // as it arrives rather than re-sorted here.
      const tasks = await familyTasks(this.data.studentId)
      this.setData({ loading: false, error: '', tasks: tasks.map(toView) })
    } catch (error) {
      /**
       * Not reachable today - `familyTasks` catches everything and answers `[]` - but the branch is
       * what keeps a future service change from rendering an outage as 「还没有约定」. A parent who
       * reads that sentence creates a duplicate of an agreement that may already exist.
       */
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ title: event.detail.value })
  },

  onPointsInput(event: { detail: { value: string } }) {
    this.setData({ points: event.detail.value })
  },

  async onSubmit() {
    const studentId = this.data.studentId
    const title = this.data.title.trim()
    const points = Number(this.data.points)

    if (this.data.submitting) {
      return
    }
    if (!studentId) {
      toastError('账号里还没有孩子的信息，请联系老师')
      return
    }
    if (!title) {
      toastError('请填写约定的内容')
      return
    }
    /**
     * The server takes a positive integer: the column is `INTEGER NOT NULL` and the web form checks
     * `min="1"` with the same message. Checking here turns a round trip into an instant message, and
     * an empty input becomes `NaN` rather than a silent 0-point agreement.
     */
    if (!Number.isInteger(points) || points <= 0) {
      toastError('奖励积分需为大于 0 的整数')
      return
    }

    this.setData({ submitting: true })
    try {
      await createFamilyTask({ student_id: studentId, title, points })
      toastSuccess('约定已记下')
      this.setData({ title: '', points: '' })
      // The server stamps the row's id, status and creation time, so the list is re-read rather than
      // patched with a locally invented row.
      await this.load({ silent: true })
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 通过 / 驳回 - the parent's answer to a task the child finished.
   *
   * One handler for both buttons, because the only difference is the status, and it is carried in
   * the dataset of whichever was tapped.
   */
  async onReview(event: { currentTarget: { dataset: Record<string, string> } }) {
    const id = Number(event.currentTarget.dataset.id)
    const approved = event.currentTarget.dataset.status === 'approved'
    if (!id || this.data.reviewingId) {
      return
    }
    this.setData({ reviewingId: id })
    try {
      await reviewFamilyTask(id, approved ? 'approved' : 'rejected')
      toastSuccess(approved ? '约定已达成' : '约定需要改进')
      // The row's status is the server's to change, so the list is re-read instead of being patched.
      await this.load({ silent: true })
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ reviewingId: 0 })
    }
  },

  /** The guard's 重新检查: re-resolve the class flags (the teacher may have switched one on). */
  onFeatureRetry() {
    void this.bootstrap({ force: true })
  },

  onRetry() {
    void this.load()
  },
})

function toView(task: FamilyTaskDto): TaskView {
  return {
    id: task.id,
    title: task.title,
    points: Number.isFinite(task.points) ? task.points : 0,
    statusText: statusTextOf(task.status),
    statusTone: statusToneOf(task.status),
    reviewable: task.status === 'completed',
    createdText: task.created_at ? formatDateTime(task.created_at) : '',
  }
}

/** The four words the web prints for the same four statuses. */
function statusTextOf(status: string): string {
  switch (status) {
    case 'pending':
      return '进行中'
    case 'completed':
      return '待查看'
    case 'approved':
      return '已达成'
    case 'rejected':
      return '需要改进'
    default:
      return status || '待确认'
  }
}

function statusToneOf(status: string): string {
  switch (status) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'warn'
    case 'completed':
      return 'info'
    default:
      return 'muted'
  }
}
