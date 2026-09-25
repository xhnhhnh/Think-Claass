/**
 * `plugins/marketplace` (积分商城) and the redemption tickets it issues.
 *
 * ## Why `studentId` still appears in the buy payload
 *
 * `POST /api/shop/buy` takes `{ studentId, itemId }` - that is the route's contract - even though
 * the server also resolves the actor from the bearer token. The id is sent from the session
 * (`studentId` of the logged-in user), never from a page's own state, so a page cannot buy on
 * behalf of a classmate by accident.
 *
 * `GET /api/shop/items` answers `items` *flat* as well as inside `data` (a legacy alias the
 * contract still declares), so `items` is what is read here.
 */

import { get, post } from '../utils/request'

export interface ShopItem {
  id: number
  name: string
  description: string
  price: number
  stock: number
  is_active: number
  teacher_id?: number
  is_holiday_limited?: number
  holiday_start_time?: string | null
  holiday_end_time?: string | null
}

export interface RedemptionTicketDto {
  id: number
  student_id?: number
  item_name: string
  /** The code the teacher scans/sights at 核销 time. */
  code: string
  status: 'pending' | 'used'
  created_at: string
  used_at: string | null
}

export interface BuyResult {
  message: string
}

/** GET /api/shop/items - what this student may spend points on. */
export async function listItems(): Promise<ShopItem[]> {
  const body = await get<{ success: true; items?: ShopItem[]; data?: { items?: ShopItem[] } }>('/api/shop/items')
  const items = body.items || (body.data ? body.data.items : null)
  return items || []
}

/** POST /api/shop/buy - spend the credits, receive a ticket (or the item's own fulfilment). */
export async function buyItem(studentId: number, itemId: number): Promise<BuyResult> {
  const body = await post<{ success: true; message?: string }>('/api/shop/buy', { studentId, itemId })
  return { message: body.message || '兑换成功' }
}

/**
 * GET /api/redemption/my - my tickets.
 *
 * No `?studentId=`: the route derives the student from the actor, and a query naming someone else
 * is ignored (the endpoint used to be an enumeration of any student's codes).
 */
export async function myTickets(): Promise<RedemptionTicketDto[]> {
  const body = await get<{ success: true; tickets: RedemptionTicketDto[] }>('/api/redemption/my')
  return body.tickets || []
}
