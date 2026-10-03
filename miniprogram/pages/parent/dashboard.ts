/**
 * 温馨家园 - the parent's home tab.
 *
 * ## Why it exists
 *
 * Until this page, a parent who logged into the mini program landed on their child's own screens
 * (成长总览 / 我的作业 / 我的) with the shop hidden. That is a mirror, not a parent experience: the
 * one thing the product asks a parent to do daily - cast the blessing that turns into a points bonus
 * - had no entry at all, so the parent side of `enable_parent_buff` was unreachable from the phone.
 *
 * The web console answered this long ago with `/parent/dashboard` (its `mobileTab: 1`), and this page
 * is that screen's phone-sized shape: the child at a glance, the blessing, and the recent ledger.
 *
 * ## Where the blessing state comes from
 *
 * `GET /api/students/:id/summary` reports `parentBlessingActive` (whether today's blessing is already
 * on record) and `parentBonusPercent` (what it is worth). Both are **server facts**, and the button is
 * rendered from them rather than from "the user tapped it earlier": a reinstall, a second phone, or a
 * blessing cast on the web would all make local memory wrong, and a wrong answer here means either a
 * lost day's bonus or a button that can only fail with 400.
 *
 * `services/parent.ts#parentPet` returns the same fact as `has_parent_buff`; it is used only as a
 * fallback for the case where the summary call fails and the pet call succeeds.
 */

import { requireSession } from '../../services/auth'
import { parentChild, parentPet, parentRecords, blessChild } from '../../services/parent'
import type { PetDto, StudentRecordDto } from '../../services/parent'
import { getSummary } from '../../services/student'
import type { StudentDto, StudentMotivationSummary } from '../../services/student'
import { studentIdOf } from '../../utils/storage'
import { FEATURE_KEYS, getResolution, isEnabled, syncTabBar } from '../../utils/feature'
import { formatDate } from '../../utils/format'
import { errorMessage, toastSuccess } from '../../utils/toast'

/** How many ledger rows the dashboard shows before deferring to the report tab. */
const LEDGER_LIMIT = 5

interface LedgerRow {
  id: number
  reason: string
  /** Already signed and formatted, so the template does no arithmetic. */
  amount: string
  tone: 'up' | 'down' | 'flat'
  when: string
}

Page({
  data: {
    loading: true,
    error: '',
    childName: '',
    studentId: null as number | null,
    child: null as StudentDto | null,
    summary: null as StudentMotivationSummary | null,
    pet: null as PetDto | null,
    ledger: [] as LedgerRow[],

    /** 今日祝福. Everything the card needs, all server-reported. */
    buffEnabled: false,
    blessingActive: false,
    bonusPercent: 0,
    blessing: false,
    blessingError: '',
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({
      studentId: studentIdOf(session.user),
      childName: session.user.name || '',
    })
  },

  onShow() {
    if (!requireSession()) {
      return
    }
    void syncTabBar(this).then(() => this.applyFeatures())
    if (!this.data.loading) {
      void this.load({ silent: true })
    }
  },

  onPullDownRefresh() {
    void this.load({ silent: true, force: true }).then(() => wx.stopPullDownRefresh())
  },

  /**
   * Is the class's 家长增益 switch on?
   *
   * The card renders either way and explains itself when the flag is off. Hiding it would leave a
   * parent who blessed the child last week wondering whether any of it counted; the flag is resolved
   * from the class feature map, the same chain the student screens use.
   */
  applyFeatures() {
    this.setData({ buffEnabled: isEnabled(getResolution().features, FEATURE_KEYS.parentBuff) })
  },

  /**
   * Load everything the screen shows.
   *
   * The four reads are independent, so they run together and each one's failure is contained: a
   * parent whose class has no pets must still see the points and the blessing. `summary` failing is
   * the only case that matters to the button, and `parentPet`'s `has_parent_buff` covers it.
   */
  async load(options: { silent?: boolean; force?: boolean } = {}) {
    const studentId = this.data.studentId
    if (studentId === null) {
      // A parent session always carries a child id (the login payload resolves it), so this means the
      // account is a parent with no linked student - a real state, and one worth naming.
      this.setData({ loading: false, error: '这个家长账号还没有关联学生，请联系老师。' })
      return
    }
    if (!options.silent) {
      this.setData({ loading: true })
    }
    this.setData({ error: '' })

    const [child, records, pet, summary] = await Promise.all([
      parentChild(studentId).catch(() => null),
      parentRecords(studentId).catch(() => [] as StudentRecordDto[]),
      parentPet(studentId),
      getSummary(studentId).catch(() => null),
    ])

    const hasSummary = summary !== null
    this.setData({
      loading: false,
      child,
      pet: pet.pet,
      summary,
      ledger: buildLedger(records),
      blessingActive: hasSummary ? summary.parentBlessingActive === true : pet.hasParentBuff,
      bonusPercent: hasSummary ? Number(summary.parentBonusPercent) || 0 : 0,
      // Only a total failure of the child's own row is worth an error card; the rest degrade quietly.
      error: child === null ? '孩子的信息没能加载出来，下拉可以重试。' : '',
    })

    if (options.force) {
      this.applyFeatures()
    }
  },

  /**
   * 送出今日祝福.
   *
   * Once per day and not reversible, which is why the button is disabled rather than hidden once it
   * has been cast: the parent can see that today is done, instead of wondering where the button went.
   */
  async onBless() {
    const studentId = this.data.studentId
    if (studentId === null || this.data.blessing || this.data.blessingActive || !this.data.buffEnabled) {
      return
    }
    this.setData({ blessing: true, blessingError: '' })
    try {
      await blessChild(studentId)
      toastSuccess('祝福已送达')
      // Re-read rather than flipping the flag: the bonus is derived server-side from the recorded
      // blessing, and the same re-read refreshes the points the parent is looking at.
      await this.load({ silent: true })
    } catch (error) {
      // A 400 here is the daily limit or the class flag; the server's sentence says which, so it is
      // printed rather than replaced with something vaguer.
      this.setData({ blessingError: errorMessage(error) })
    } finally {
      this.setData({ blessing: false })
    }
  },

  onGoReport() {
    wx.redirectTo({ url: '/pages/parent/report' })
  },

  onGoLeave() {
    wx.redirectTo({ url: '/pages/parent/leave-request' })
  },

  onGoHomework() {
    wx.redirectTo({ url: '/pages/student/homework' })
  },
})

/**
 * The ledger rows, newest first.
 *
 * The server's records carry the amount under either `points` or `amount` depending on the row's
 * origin (a legacy column pair), and a missing reason is common for seeded data - so both are
 * normalised here rather than in the template, where a missing field renders as `undefined`.
 */
function buildLedger(records: StudentRecordDto[]): LedgerRow[] {
  return records
    .slice()
    .reverse()
    .slice(0, LEDGER_LIMIT)
    .map((record) => {
      const raw = typeof record.points === 'number' ? record.points : typeof record.amount === 'number' ? record.amount : 0
      return {
        id: record.id,
        reason: (record.reason || '').trim() || typeLabel(record.type),
        amount: raw > 0 ? `+${raw}` : String(raw),
        tone: raw > 0 ? 'up' : raw < 0 ? 'down' : 'flat',
        when: record.created_at ? formatDate(Date.parse(record.created_at.replace(' ', 'T'))) : '',
      }
    })
}

/** The ledger's own vocabulary; an unknown type is printed as-is rather than hidden. */
function typeLabel(type: string): string {
  switch (type) {
    case 'ADD_POINTS':
      return '加分'
    case 'DEDUCT_POINTS':
      return '扣分'
    case 'CHECKIN':
      return '签到'
    case 'REDEEM':
      return '兑换'
    default:
      return type || '记录'
  }
}
