/**
 * Marketplace domain types.
 *
 * The DTOs are re-exported from `@thinkclass/contracts` so the plugin and the
 * frontend share one definition; only what describes this plugin's own SQL surface is
 * declared here.
 *
 * Two details are load-bearing for the HTTP contract, because the repository returns
 * raw rows and the controller passes them straight through:
 *
 *   - column names ARE the response field names (`stock`, `is_active`, `teacher_id`,
 *     `is_holiday_limited`, `current_price`, `highest_bidder_id`, ...) and the
 *     frontend reads them directly;
 *   - `listItems` used to join `classes` and `students` to find "the items a student's
 *     teacher sells". Those two tables are classroom-owned, so the join is gone: the
 *     service resolves student -> class through `classroom.public` and the repository
 *     only ever touches `shop_items`. See marketplace.service.ts `listItems`.
 *
 * The pre-migration service drove the shared helpers `spendStudentPoints` /
 * `addStudentPoints` and one raw `UPDATE students SET available_points = ...`; all of
 * those are gone, because `students` and `records` belong to classroom and are reached
 * through `classroom.public` in marketplace.service.ts.
 */

import type { Auction, BlindBox, ShopItem } from '@thinkclass/contracts/domains/marketplace';
import type { SqlParam } from '@thinkclass/plugin-sdk';

/** Raw values the pre-migration service passed to better-sqlite3 unchanged. */
export type RawParam = SqlParam;

export interface NewShopItemRow {
  name: RawParam;
  description: RawParam;
  price: RawParam;
  stock: RawParam;
  is_active: RawParam;
  teacher_id: RawParam;
  is_holiday_limited: RawParam;
  holiday_start_time: RawParam;
  holiday_end_time: RawParam;
}

export interface ShopItemUpdate {
  name: RawParam;
  description: RawParam;
  price: RawParam;
  stock: RawParam;
  is_holiday_limited: RawParam;
  holiday_start_time: RawParam;
  holiday_end_time: RawParam;
}

export interface NewAuctionRow {
  item_name: RawParam;
  description: RawParam;
  starting_price: RawParam;
  end_time: RawParam;
}

export interface AuctionUpdate {
  item_name: RawParam;
  description: RawParam;
  starting_price: RawParam;
  status: RawParam;
  end_time: RawParam;
}

export interface NewBlindBoxRow {
  name: RawParam;
  description: RawParam;
  price: RawParam;
  is_active: RawParam;
}

export interface BlindBoxUpdate {
  name: RawParam;
  description: RawParam;
  price: RawParam;
  is_active: RawParam;
}

/**
 * The SQL boundary.
 *
 * Every method here runs against `ctx.db`, whose ownership check is what keeps the
 * statements inside the four tables the manifest adopts (`auctions`, `blind_boxes`,
 * `shop_items`, `redemption_tickets`) plus the read-only `users` lookup. `students`,
 * `classes` and `records` are deliberately absent - classroom owns them.
 */
export interface MarketplaceRepository {
  /** Synchronous better-sqlite3 transaction over this plugin's own tables. */
  transaction<T>(fn: () => T): T;

  // -- shop items ---------------------------------------------------------
  /** `listItems`'s teacher scope: the items the student's class teacher sells. */
  listShopItemsByTeacher(teacherId: number | null): ShopItem[];
  listActiveShopItems(): ShopItem[];
  listAllShopItems(teacherId?: RawParam): ShopItem[];
  getShopItem(itemId: RawParam): ShopItem | null;
  createShopItem(input: NewShopItemRow): number;
  updateShopItemStatus(id: RawParam, isActive: RawParam): void;
  updateShopItem(id: RawParam, input: ShopItemUpdate): void;
  decrementShopItemStock(itemId: RawParam): void;
  insertRedemptionTicket(studentId: number, itemId: RawParam, code: string): void;
  /** The legacy fallback when `createItem` carries no `teacher_id`. */
  findFirstTeacherId(): number | null;

  // -- auctions -----------------------------------------------------------
  listAuctions(): Auction[];
  getAuction(id: RawParam): Auction | null;
  createAuction(input: NewAuctionRow): number;
  updateAuction(id: RawParam, input: AuctionUpdate): void;
  /** Records the bid that just won the top slot: price + highest bidder together. */
  setAuctionLeader(id: RawParam, currentPrice: number, bidderId: number): void;
  deleteAuction(id: RawParam): void;

  // -- blind boxes --------------------------------------------------------
  listBlindBoxes(): BlindBox[];
  getBlindBox(id: RawParam): BlindBox | null;
  createBlindBox(input: NewBlindBoxRow): number;
  updateBlindBox(id: RawParam, input: BlindBoxUpdate): void;
  deleteBlindBox(id: RawParam): void;
}

export type { Auction, BlindBox, ShopItem };
