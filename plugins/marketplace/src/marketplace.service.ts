/**
 * Marketplace service.
 *
 * Two storage boundaries meet here, and the difference is the whole point of the
 * migration:
 *
 *   auctions / blind_boxes / shop_items / redemption_tickets   owned -> `ctx.db`
 *   students.available_points, students.total_points, records  owned by classroom
 *                                                              -> `classroom.public`
 *
 * ## The points semantics, which are the risky part of this migration
 *
 * The pre-migration code mixed two different balance operations, and they must not be
 * collapsed into one:
 *
 *   `spendStudentPoints(...)` + the raw `UPDATE students SET available_points = ...`
 *       move ONLY `available_points`. The points were still earned, so `total_points`
 *       (the lifetime figure) must not move. -> `classroom.public.transferStudentCredits`
 *
 *   `addStudentPoints(...)` moves BOTH `total_points` and `available_points`.
 *       -> `classroom.public.adjustPoints`
 *
 * Call site by call site, preserving the original:
 *
 *   buyItem        spend  -price                -> transferStudentCredits (available only)
 *   bidAuction     spend  -bid                  -> transferStudentCredits (available only)
 *   bidAuction     refund +currentPrice to the outbid student
 *                                              -> transferStudentCredits (available only;
 *                                                 the legacy line was a raw
 *                                                 `available_points + ?` UPDATE)
 *   buyBlindBox    spend  -price                -> transferStudentCredits (available only)
 *   buyBlindBox    consolation +10              -> adjustPoints (BOTH balances; the
 *                                                 legacy line called `addStudentPoints`)
 *
 * Using `adjustPoints` for a spend or a refund would inflate a student's lifetime
 * points; using `transferStudentCredits` for the consolation would silently stop
 * counting a prize toward `total_points`. Neither is caught by any existing test, which
 * is why tests/plugins/marketplace-service.test.ts asserts both balances separately.
 *
 * ## Atomicity, stated honestly
 *
 * The pre-migration versions ran the balance update, the ledger insert and the
 * platform writes in one synchronous better-sqlite3 transaction. That is no longer
 * possible: the port is async and a synchronous transaction cannot span an `await`. So
 * a money operation is a short sequence of individually-atomic steps, ordered so the
 * failure that can actually happen is the harmless one:
 *
 *   - a debit happens before the platform writes, and a failure there refunds it, so a
 *     student is never charged for something they did not receive;
 *   - in `bidAuction` the new bidder is debited *before* the previous bidder is
 *     refunded, so a refused debit cannot leave the outbid student refunded while still
 *     holding the top bid (which would let the same bid be refunded twice). If the
 *     refund is refused, the debit is compensated and the request fails cleanly.
 *
 * The remaining exposure is a process death between two steps (and a thrown
 * `setAuctionLeader` after both transfers); the `records` ledger makes it visible.
 * Restoring true cross-plugin atomicity needs a kernel-level unit of work, which is
 * P6/P7 work - the same tradeoff economy.service.ts and gacha.service.ts document.
 *
 * ## Feature gates, and one known divergence
 *
 * `assertStudentFeatureEnabled` / `assertActorFeatureEnabled` from
 * `api/utils/classFeatures.ts` are replaced by `classroom.public.checkStudentFeature`
 * and `getStudentByUserId`. The port returns a refusal instead of throwing, so each
 * code is mapped back onto the status and message the pre-migration service produced
 * (`gateApiError` / `creditsApiError` below).
 *
 * The divergence is the one HANDOFF §8.3.1 already records for economy/gacha:
 * `checkStudentFeature` collapses "student's class row is gone" (legacy 404
 * `班级未找到`) into `feature-disabled` (403 `该功能当前已关闭`). The normal path is
 * identical.
 */

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { Auction, BlindBox, ShopItem } from '@thinkclass/contracts/domains/marketplace';
import { ApiError } from '@thinkclass/kernel';

import type { MarketplaceRepository } from './marketplace.types.js';

/** The legacy `ensureValidShopItemInput` helper, unchanged. */
function ensureValidShopItemInput(input: { name?: unknown; price?: unknown; stock?: unknown }): void {
  if (
    !input.name ||
    typeof input.price !== 'number' ||
    input.price < 0 ||
    typeof input.stock !== 'number' ||
    input.stock < -1
  ) {
    throw new ApiError(400, 'Invalid input');
  }
}

/**
 * The validation `spendStudentPoints` used to perform (`Number.isFinite(amount) &&
 * amount > 0`, else 400 `Invalid amount`).
 *
 * It is kept as an explicit step because the port only reports `invalid-amount` for a
 * transfer it already accepted, and because the legacy order matters: a bid is checked
 * against the current price and the balance *before* its own amount is validated.
 */
function assertSpendableAmount(amount: unknown): asserts amount is number {
  if (!Number.isFinite(amount) || (amount as number) <= 0) {
    throw new ApiError(400, 'Invalid amount');
  }
}

/**
 * Map a feature-gate refusal onto this domain's HTTP status.
 *
 * `assertStudentFeatureEnabled` threw 404 `学生未找到` for a missing student and
 * `assertActorFeatureEnabled` threw 404 `班级未找到` for a user id with no student row
 * (that is `getClassIdByUserId`'s message, which the actor path keeps); a disabled flag
 * was always 403 `该功能当前已关闭`.
 */
function gateApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    default:
      return new ApiError(400, refusal.message);
  }
}

/**
 * The credit path has its own messages, because the pre-migration `pointsService`
 * produced them: an overdraft was 400 `Not enough points` (thrown by
 * `spendStudentPoints` after reading the balance), and a missing student was 404
 * `Student not found` (thrown by `getStudentOrThrow`, in English unlike the gate).
 */
function creditsApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'insufficient-credits':
      return new ApiError(400, 'Not enough points');
    case 'student-not-found':
      return new ApiError(404, 'Student not found');
    case 'invalid-amount':
      return new ApiError(400, 'Invalid amount');
    default:
      return new ApiError(400, refusal.message);
  }
}

export class MarketplaceService {
  constructor(
    private readonly repository: MarketplaceRepository,
    private readonly classroom: ClassroomPort,
    /** Injectable so the blind-box roll is deterministic in tests, as gacha does. */
    private readonly random: () => number = Math.random,
  ) {}

  // -- shop items ---------------------------------------------------------

  /**
   * List the items a student can buy.
   *
   * The pre-migration query joined `shop_items` to `classes` and `students` to find the
   * student's teacher. Both of those tables are classroom-owned, so the join is now
   * three steps: `getStudentById` -> `getClassById` -> items of that class's teacher.
   * Verified equivalent: `s.class_id = c.id` pins `c` to exactly one class row, so the
   * legacy result set was exactly "items whose `teacher_id` equals the teacher of the
   * student's class" - and a student with no class row produced no rows there while a
   * `teacher_id IS NULL` class produces none here either.
   *
   * The actor gate still runs first, and still only for a student actor.
   */
  async listItems(studentIdInput: unknown, actorUserId: number | null): Promise<ShopItem[]> {
    if (actorUserId) await this.assertActorFeatureEnabled(actorUserId, 'enable_shop');

    // The legacy branch was a truthy test on the raw query value, not a numeric one.
    if (!studentIdInput) return this.repository.listActiveShopItems();

    const studentId = Number(studentIdInput);
    if (!Number.isFinite(studentId)) return [];

    const student = await this.classroom.getStudentById(studentId);
    if (!student) return [];

    const classRow = await this.classroom.getClassById(student.classId);
    if (!classRow) return [];

    return this.repository.listShopItemsByTeacher(classRow.teacherId);
  }

  listAllItems(query: Record<string, any>): ShopItem[] {
    const { teacherId } = query ?? {};
    return this.repository.listAllShopItems(teacherId ?? undefined);
  }

  createItem(input: Record<string, any>) {
    const {
      name,
      description,
      price,
      stock,
      is_active,
      teacher_id,
      is_holiday_limited,
      holiday_start_time,
      holiday_end_time,
    } = input ?? {};
    ensureValidShopItemInput({ name, price, stock });

    let teacherId = teacher_id;
    if (!teacherId) {
      // `users` has no plugin yet (auth is not migrated), so this stays a declared
      // `data.reads` entry. That is also why the host has to create the table: a
      // `data.reads` declaration grants no creation right, so in the kernel
      // composition (which never runs api/db.ts) this read needs `users` added to
      // `ensureReadOnlyLegacyTables`. Reported to the Lead.
      teacherId = this.repository.findFirstTeacherId() ?? 1;
    }

    const id = this.repository.createShopItem({
      name,
      description,
      price,
      stock: stock ?? 999,
      is_active: is_active ?? 1,
      teacher_id: teacherId,
      is_holiday_limited: is_holiday_limited ? 1 : 0,
      holiday_start_time: holiday_start_time || null,
      holiday_end_time: holiday_end_time || null,
    });

    return { id };
  }

  updateItemStatus(id: string, input: Record<string, any>): void {
    this.repository.updateShopItemStatus(id, input?.is_active ? 1 : 0);
  }

  updateItem(id: string, input: Record<string, any>): void {
    const { name, description, price, stock, is_holiday_limited, holiday_start_time, holiday_end_time } =
      input ?? {};

    this.repository.updateShopItem(id, {
      name,
      description,
      price,
      stock,
      is_holiday_limited: is_holiday_limited ? 1 : 0,
      holiday_start_time: holiday_start_time || null,
      holiday_end_time: holiday_end_time || null,
    });
  }

  /**
   * Buy a shop item: debit the available balance, decrement stock, issue a ticket.
   *
   * The returned `points` is the student's available balance *after* the spend - the
   * exact number the pre-migration `spendStudentPoints(...).available_points` produced.
   */
  async buyItem(input: Record<string, any>) {
    const { studentId, itemId } = input ?? {};
    const student = await this.requireStudentWithFeature(Number(studentId), 'enable_shop');

    const item = this.repository.getShopItem(itemId);
    if (!item || (item.stock <= 0 && item.stock !== -1)) throw new ApiError(400, 'Item out of stock');
    if (item.is_active !== 1) throw new ApiError(400, 'Item is not active');

    if (item.is_holiday_limited === 1) {
      const now = new Date().toISOString();
      if (item.holiday_start_time && now < item.holiday_start_time) {
        throw new ApiError(400, 'This item is not yet available for purchase');
      }
      if (item.holiday_end_time && now > item.holiday_end_time) {
        throw new ApiError(400, 'This item is no longer available for purchase');
      }
    }

    assertSpendableAmount(item.price);

    // `transferStudentCredits` is the only sanctioned writer of `students`, and it
    // re-checks the balance, so an overdraft is refused even though the balance was
    // read a moment ago. It moves `available_points` only - `total_points` stays put,
    // exactly as `spendStudentPoints` left it.
    const spent = await this.classroom.transferStudentCredits({
      studentId: student.id,
      delta: -item.price,
      reason: 'marketplace.buy_item',
      // The legacy endpoints carry no actor into the money path; 0 is the same
      // placeholder economy and gacha pass for the same reason.
      actorId: 0,
    });
    if (spent.refusal) throw creditsApiError(spent.refusal);

    const code = `RED-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    try {
      this.repository.transaction(() => {
        if (item.stock !== -1) this.repository.decrementShopItemStock(itemId);
        this.repository.insertRedemptionTicket(student.id, itemId, code);
      });
    } catch (error) {
      // The debit is already committed and the platform writes rolled back, so give the
      // points back rather than charging for a ticket that does not exist.
      await this.classroom.transferStudentCredits({
        studentId: student.id,
        delta: item.price,
        reason: 'marketplace.buy_item.rollback',
        actorId: 0,
      });
      throw error;
    }

    // Appended after the platform writes so a rolled-back purchase leaves no ledger
    // row - the visible history matches what actually happened.
    await this.ledger(student.id, 'BUY_ITEM', -item.price, `Bought item: ${item.name}`);

    return { points: spent.value.availablePoints };
  }

  // -- auctions -----------------------------------------------------------

  async listAuctions(actorUserId: number | null): Promise<Auction[]> {
    if (actorUserId) await this.assertActorFeatureEnabled(actorUserId, 'enable_auction_blind_box');
    return this.repository.listAuctions();
  }

  /**
   * Place a bid.
   *
   * Two transfers, and they must use `transferStudentCredits`: both the debit and the
   * refund of the outbid student move the *available* balance only. The refund line is
   * the one that used to be a raw
   * `UPDATE students SET available_points = available_points + ?`.
   *
   * Ordering: debit the new bidder first, then refund the previous one. The legacy
   * order was the reverse; with one transaction that made no difference, but with two
   * port calls it does. Refunding first means a refused debit would leave the outbid
   * student credited while their bid still stands - and the next bid would refund the
   * same bid again. Debiting first makes the common refusal a no-op, and a refused
   * refund is compensated by crediting the debit back.
   */
  async bidAuction(id: string, input: Record<string, any>) {
    const { studentId, bid_amount } = input ?? {};
    const student = await this.requireStudentWithFeature(Number(studentId), 'enable_auction_blind_box');

    const auction = this.repository.getAuction(id);
    if (!auction) throw new ApiError(404, 'Auction not found');
    if (auction.status !== 'active') throw new ApiError(400, 'Auction is not active');
    if (auction.end_time && new Date(auction.end_time) < new Date()) throw new ApiError(400, 'Auction has ended');

    const currentPrice = auction.current_price || auction.starting_price;
    if (bid_amount <= currentPrice) {
      throw new ApiError(400, `Bid amount must be greater than current price: ${currentPrice}`);
    }
    if (student.availablePoints < bid_amount) throw new ApiError(400, 'Not enough points');
    assertSpendableAmount(bid_amount);

    const spent = await this.classroom.transferStudentCredits({
      studentId: student.id,
      delta: -bid_amount,
      reason: 'marketplace.auction_bid',
      actorId: 0,
    });
    if (spent.refusal) throw creditsApiError(spent.refusal);

    if (auction.highest_bidder_id && auction.highest_bidder_id !== student.id) {
      const previousBidder = await this.classroom.getStudentById(auction.highest_bidder_id);
      if (previousBidder) {
        const refunded = await this.classroom.transferStudentCredits({
          studentId: auction.highest_bidder_id,
          // The legacy refund credited the *current price*, i.e. the standing bid.
          delta: currentPrice,
          reason: 'marketplace.auction_refund',
          actorId: 0,
        });
        if (refunded.refusal) {
          // Undo the debit: nothing else has been written, so the request can fail
          // without leaving either student out of pocket.
          await this.classroom.transferStudentCredits({
            studentId: student.id,
            delta: bid_amount,
            reason: 'marketplace.auction_bid.rollback',
            actorId: 0,
          });
          throw creditsApiError(refunded.refusal);
        }

        await this.ledger(
          auction.highest_bidder_id,
          'AUCTION_REFUND',
          currentPrice,
          `Refund for outbid on auction: ${auction.item_name}`,
        );
      }
    }

    this.repository.setAuctionLeader(id, bid_amount, student.id);
    await this.ledger(student.id, 'AUCTION_BID', -bid_amount, `Placed bid on auction: ${auction.item_name}`);

    return { points: spent.value.availablePoints };
  }

  // -- blind boxes --------------------------------------------------------

  async listBlindBoxes(actorUserId: number | null): Promise<BlindBox[]> {
    if (actorUserId) await this.assertActorFeatureEnabled(actorUserId, 'enable_auction_blind_box');
    return this.repository.listBlindBoxes();
  }

  /**
   * Buy a blind box.
   *
   * The spend moves the available balance only; the consolation prize moves BOTH
   * balances, because it is a *prize* - the legacy line called `addStudentPoints`, which
   * incremented `total_points` as well as `available_points`. That asymmetry is the
   * single easiest thing to get wrong here.
   */
  async buyBlindBox(input: Record<string, any>) {
    const { studentId, boxId, blindBoxId } = input ?? {};
    const student = await this.requireStudentWithFeature(Number(studentId), 'enable_auction_blind_box');

    let price = 100;
    let boxName = '神秘盲盒';

    const selectedBoxId = boxId ?? blindBoxId;
    if (selectedBoxId) {
      const box = this.repository.getBlindBox(selectedBoxId);
      if (!box) throw new ApiError(404, 'Blind box not found');
      if (box.is_active !== 1) throw new ApiError(400, 'Blind box is not active');
      price = box.price;
      boxName = box.name;
    }

    assertSpendableAmount(price);

    const spent = await this.classroom.transferStudentCredits({
      studentId: student.id,
      delta: -price,
      reason: 'marketplace.blind_box',
      actorId: 0,
    });
    if (spent.refusal) throw creditsApiError(spent.refusal);

    await this.ledger(student.id, 'BUY_BLIND_BOX', -price, `Bought blind box: ${boxName}`);

    const randomValue = this.random();
    let reward = '';
    let points = spent.value.availablePoints;
    if (randomValue < 0.1) {
      reward = '稀有碎片 x1';
    } else if (randomValue < 0.3) {
      reward = '普通碎片 x2';
    } else if (randomValue < 0.6) {
      reward = '神秘道具 x1';
    } else {
      reward = '谢谢参与 (获得安慰奖 10积分)';
      // `adjustPoints`, not `transferStudentCredits`: the legacy `addStudentPoints`
      // moved `total_points` too, and dropping that would stop counting consolation
      // prizes as earned points.
      const granted = await this.classroom.adjustPoints({
        studentId: student.id,
        delta: 10,
        reason: 'marketplace.blind_box_consolation',
        actorId: 0,
      });
      points = granted.availablePoints;
      await this.ledger(student.id, 'BLIND_BOX_CONSOLATION', 10, 'Blind box consolation prize');
    }

    return { points, reward };
  }

  // -- auction / blind-box administration (no points movement) -------------

  createAuction(input: Record<string, any>) {
    const { item_name, description, starting_price, end_time } = input ?? {};
    const id = this.repository.createAuction({
      item_name,
      description: description || '',
      starting_price: starting_price || 0,
      end_time: end_time || null,
    });
    return { id };
  }

  updateAuction(id: string, input: Record<string, any>): void {
    const { item_name, description, starting_price, status, end_time } = input ?? {};
    this.repository.updateAuction(id, { item_name, description, starting_price, status, end_time });
  }

  deleteAuction(id: string): void {
    this.repository.deleteAuction(id);
  }

  createBlindBox(input: Record<string, any>) {
    const { name, description, price, is_active } = input ?? {};
    if (!name || typeof price !== 'number') throw new ApiError(400, 'Invalid input');

    const id = this.repository.createBlindBox({
      name,
      description: description || '',
      price,
      // Creation defaults to active; the update path below deliberately does not.
      is_active: is_active === undefined ? 1 : is_active ? 1 : 0,
    });
    return { id };
  }

  updateBlindBox(id: string, input: Record<string, any>): void {
    const { name, description, price, is_active } = input ?? {};
    // No `undefined` default here: the legacy update wrote 0 for a missing `is_active`,
    // and "update without the field deactivates the box" is the behaviour on record.
    this.repository.updateBlindBox(id, {
      name,
      description: description || '',
      price,
      is_active: is_active ? 1 : 0,
    });
  }

  deleteBlindBox(id: string): void {
    this.repository.deleteBlindBox(id);
  }

  // -- internals ----------------------------------------------------------

  /**
   * The per-student feature gate, in the pre-migration order: resolve the student
   * (404 `学生未找到`), then check the class flag (403 `该功能当前已关闭`), both before
   * any write. Returns the snapshot the money paths need.
   */
  private async requireStudentWithFeature(studentId: number, feature: string): Promise<StudentSnapshot> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, '学生未找到');

    const gate = await this.classroom.checkStudentFeature(student.id, feature);
    if (gate.refusal) throw gateApiError(gate.refusal);

    return student;
  }

  /**
   * The per-*actor* gate: `RequestContext.actor` only carries `userId`, so the student
   * has to be resolved from it - exactly what the legacy
   * `assertActorFeatureEnabled(actorId, 'student', flag)` did via `getClassIdByUserId`,
   * including its 404 `班级未找到` for a user id with no student row.
   */
  private async assertActorFeatureEnabled(userId: number, feature: string): Promise<void> {
    const student = await this.classroom.getStudentByUserId(userId);
    if (!student) throw new ApiError(404, '班级未找到');

    const gate = await this.classroom.checkStudentFeature(student.id, feature);
    if (gate.refusal) throw gateApiError(gate.refusal);
  }

  /**
   * Append to the shared point ledger.
   *
   * The pre-migration `pointsService` inserted into `records` directly; that write now
   * goes through the port, which is the only sanctioned writer of the ledger. Types and
   * descriptions are unchanged, so existing history and any reader keep working.
   */
  private async ledger(studentId: number, type: string, amount: number, description: string): Promise<void> {
    await this.classroom.recordStudentLedgerEntry({ studentId, type, amount, description });
  }
}
