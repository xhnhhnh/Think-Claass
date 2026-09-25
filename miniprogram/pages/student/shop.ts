/**
 * 积分商城 - spend credits, then find the ticket again.
 *
 * Two panes in one page rather than two tabs: 商品 and 我的兑换券 are the same errand (buy something,
 * show the teacher the code), and a pupil who has just spent 50 学分 should not have to discover a
 * second screen to see what they got. The pane switch is in-page, so the whole thing stays one tab
 * and one pull-to-refresh.
 *
 * ## Confirmation is not optional
 *
 * Credits are the class currency and the shop has no refund path, so `buyItem` is always behind
 * `wx.showModal` naming the item and the price. The student id sent with the purchase comes from the
 * session, never from the page, so a stale render cannot buy something for a classmate.
 */

import { requireSession } from '../../services/auth'
import { buyItem, listItems, myTickets } from '../../services/shop'
import type { RedemptionTicketDto, ShopItem } from '../../services/shop'
import { getSummary } from '../../services/student'
import type { ClassFeatureFlags } from '../../utils/storage'
import { studentIdOf } from '../../utils/storage'
import { getResolution, resolveFeatures, syncTabBar } from '../../utils/feature'
import { formatRelative, ticketStatusText } from '../../utils/format'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface ItemView extends ShopItem {
  soldOut: boolean
  affordable: boolean
}

interface TicketView extends RedemptionTicketDto {
  statusText: string
  createdText: string
}

Page({
  data: {
    featuresReady: false,
    features: {} as ClassFeatureFlags,
    loading: true,
    error: '',
    /** `items` or `tickets`. */
    pane: 'items',
    items: [] as ItemView[],
    tickets: [] as TicketView[],
    /** `null` when the account has no linked student row (a parent, or an unlinked login). */
    balance: null as number | null,
    buyingId: 0,
  },

  /** Held outside `data`: the id is only ever used by the code, never rendered. */
  studentId: null as number | null,

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.studentId = studentIdOf(session.user)
    void this.bootstrap()
  },

  onShow() {
    void syncTabBar(this)
    if (!this.data.loading) {
      void this.load({ silent: true })
    }
  },

  onPullDownRefresh() {
    void this.load({ silent: true, force: true }).then(() => wx.stopPullDownRefresh())
  },

  async bootstrap() {
    await resolveFeatures()
    this.applyFeatures()
    await this.load()
  },

  applyFeatures() {
    const resolution = getResolution()
    this.setData({ featuresReady: true, features: resolution.features })
  },

  async load(options: { silent?: boolean; force?: boolean } = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    if (options.force) {
      await resolveFeatures({ force: true })
      this.applyFeatures()
    }

    const [itemsResult, ticketsResult, balanceResult] = await Promise.all([
      this.fetchItems(),
      this.fetchTickets(),
      this.fetchBalance(),
    ])

    this.setData({
      loading: false,
      error: itemsResult.error || ticketsResult.error,
      items: itemsResult.items,
      tickets: ticketsResult.tickets,
      balance: balanceResult,
    })
  },

  async fetchItems(): Promise<{ items: ItemView[]; error: string }> {
    try {
      const raw = await listItems()
      const balance = this.data.balance
      const items = raw.map((item) => ({
        ...item,
        soldOut: item.stock <= 0,
        // Before the balance has loaded, treat everything as affordable rather than greying the whole
        // shop out for a moment.
        affordable: balance === null || item.price <= balance,
      }))
      return { items, error: '' }
    } catch (error) {
      return { items: [], error: errorMessage(error) }
    }
  },

  async fetchTickets(): Promise<{ tickets: TicketView[]; error: string }> {
    try {
      const raw = await myTickets()
      const tickets = raw.map((ticket) => ({
        ...ticket,
        statusText: ticketStatusText(ticket.status),
        createdText: formatRelative(ticket.created_at),
      }))
      return { tickets, error: '' }
    } catch (error) {
      return { tickets: [], error: errorMessage(error) }
    }
  },

  async fetchBalance(): Promise<number | null> {
    if (this.studentId === null) {
      return null
    }
    try {
      const summary = await getSummary(this.studentId)
      return summary.availableCredits
    } catch (error) {
      // The balance is a nicety next to the catalogue; the catalogue is the page.
      return null
    }
  },

  onPaneTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const pane = event.currentTarget.dataset.pane
    if (pane === 'items' || pane === 'tickets') {
      this.setData({ pane })
    }
  },

  async onBuy(event: { currentTarget: { dataset: Record<string, string> } }) {
    const itemId = Number(event.currentTarget.dataset.id)
    const item = this.data.items.filter((entry) => entry.id === itemId)[0]
    if (!item || this.data.buyingId) {
      return
    }

    if (this.studentId === null) {
      toastError('这个账号还没有关联学生，暂时不能兑换')
      return
    }
    if (item.soldOut) {
      toastError('这件物品已经兑完了')
      return
    }

    const confirmed = await confirm({
      title: '确认兑换',
      content: `用 ${item.price} 学分兑换「${item.name}」？兑换后学分不能退回。`,
      confirmText: '兑换',
    })
    if (!confirmed) {
      return
    }

    this.setData({ buyingId: itemId })
    try {
      const result = await buyItem(this.studentId, itemId)
      toastSuccess(result.message)
      // The catalogue's stock and the student's balance both moved; the tickets list just grew.
      await this.load({ silent: true })
      this.setData({ pane: 'tickets' })
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ buyingId: 0 })
    }
  },

  onRetry() {
    void this.bootstrap()
  },
})
