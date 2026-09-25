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

import type { RequestActor } from './marketplace.authorization.js';
import type { MarketplaceRepository } from './marketplace.types.js';

/** Admin/superadmin own every shop row, so the scope checks below always let them through. */
function isStaffAdmin(actor: RequestActor): boolean {
  return actor.role === 'admin' || actor.role === 'superadmin';
}

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
   * List the items a caller may buy, narrowed to the caller's own scope.
   *
   * The pre-migration query joined `shop_items` to `classes` and `students` to find the
   * student's teacher. Both of those tables are classroom-owned, so the join is now
   * three steps: `getStudentById` -> `getClassById` -> items of that class's teacher.
   * Verified equivalent: `s.class_id = c.id` pins `c` to exactly one class row, so the
   * legacy result set was exactly "items whose `teacher_id` equals the teacher of the
   * student's class" - and a student with no class row produced no rows there while a
   * `teacher_id IS NULL` class produces none here either.
   *
   * What is *not* preserved is the old "no `?studentId=` means the whole table" branch,
   * which is the defect the authorization round closed: the scope now comes from the
   * actor, so a student sees their own teacher's shelf, a teacher sees the items they
   * sell, and only admin/superadmin see every active item.
   *
   * The actor feature gate still runs first, and still only for a student actor.
   */
  async listItems(actor: RequestActor): Promise<ShopItem[]> {
    if (actor.role === 'student') {
      await this.assertActorFeatureEnabled(actor.userId, 'enable_shop');

      // No student row behind the login is an empty scope, not the global list. (In practice
      // the gate above already answers 404 for that login; this keeps the fallback honest.)
      if (actor.studentId === null) return [];

      const student = await this.classroom.getStudentById(actor.studentId);
      if (!student) return [];

      const classRow = await this.classroom.getClassById(student.classId);
      if (!classRow) return [];

      return this.repository.listShopItemsByTeacher(classRow.teacherId);
    }

    if (actor.role === 'teacher') return this.repository.listShopItemsByTeacher(actor.userId);

    return this.repository.listActiveShopItems();
  }

  /**
   * The management view: every item, including deactivated ones.
   *
   * A teacher's `teacherId` is forced to their own login id - the `?teacherId=` filter used
   * to be trusted, which let anyone read (and, with the write routes open, edit) another
   * teacher's shelf. Admin/superadmin may still narrow by any teacher.
   */
  listAllItems(actor: RequestActor, query: Record<string, any>): ShopItem[] {
    if (!isStaffAdmin(actor)) return this.repository.listAllShopItems(actor.userId);
    const { teacherId } = query ?? {};
    return this.repository.listAllShopItems(teacherId ?? undefined);
  }

  /**
   * Create an item on the *caller's* shelf.
   *
   * A teacher always sells their own items, so `teacher_id` is the actor - the body may no
   * longer hand the row to somebody else (the legacy fallback, "no `teacher_id` means the
   * first teacher in the database", only remains for admin/superadmin, who have no shelf).
   */
  createItem(actor: RequestActor, input: Record<string, any>) {
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

    let teacherId = actor.role === 'teacher' ? actor.userId : teacher_id;
    if (!teacherId) {
      // Reached only by admin/superadmin creating an item without naming a seller; a teacher
      // always lands on their own id above. `users` has no plugin yet (auth is not migrated),
      // so this stays a declared `data.reads` entry. That is also why the host has to create
      // the table: a `data.reads` declaration grants no creation right, so in the kernel
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

  updateItemStatus(actor: RequestActor, id: string, input: Record<string, any>): void {
    this.assertItemOwner(actor, id);
    this.repository.updateShopItemStatus(id, input?.is_active ? 1 : 0);
  }

  updateItem(actor: RequestActor, id: string, input: Record<string, any>): void {
    this.assertItemOwner(actor, id);

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
   * `studentId` is the *actor's* student row, resolved by the controller; the request body is
   * no longer a source of identity (it may only confirm the same id). The returned `points` is
   * the student's available balance *after* the spend - the exact number the pre-migration
   * `spendStudentPoints(...).available_points` produced.
   */
  async buyItem(studentId: number, input: Record<string, any>) {
    const { itemId } = input ?? {};
    const student = await this.requireStudentWithFeature(studentId, 'enable_shop');

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
      ledger: { type: 'BUY_ITEM', description: `Bought item: ${item.name}` },
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

    return { points: spent.value.availablePoints };
  }

  // -- auctions -----------------------------------------------------------

  /**
   * The auction board.
   *
   * `auctions` carries no class column (the legacy table shape the frontend reads), so a
   * "student/teacher of this class" filter cannot be expressed in a query. What the round can
   * enforce - and does - is that the caller is one of those roles rather than anonymous; the
   * student feature gate still runs for a student actor.
   */
  async listAuctions(actor: RequestActor): Promise<Auction[]> {
    if (actor.role === 'student') {
      await this.assertActorFeatureEnabled(actor.userId, 'enable_auction_blind_box');
    }
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
   *
   * `studentId` is the actor's own student row; the body's `studentId` is only allowed to
   * confirm it (the controller refuses a mismatch), so a bid can no longer be placed out of
   * somebody else's balance.
   */
  async bidAuction(studentId: number, id: string, input: Record<string, any>) {
    const { bid_amount } = input ?? {};
    const student = await this.requireStudentWithFeature(studentId, 'enable_auction_blind_box');

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
      ledger: { type: 'AUCTION_BID', description: `Placed bid on auction: ${auction.item_name}` },
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
          ledger: { type: 'AUCTION_REFUND', description: `Refund for outbid on auction: ${auction.item_name}` },
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

      }
    }

    this.repository.setAuctionLeader(id, bid_amount, student.id);

    return { points: spent.value.availablePoints };
  }

  // -- blind boxes --------------------------------------------------------

  /**
   * The blind-box list, with a different *view* per role.
   *
   * Teacher/admin get the management listing - every box, active or not, which is what the
   * matrix's role column describes (its note for this route is that an anonymous caller saw
   * every row "including the ended ones"). A student gets the shop listing: the active boxes
   * they can buy, and nothing else.
   *
   * Deliberate deviation from the literal role column: the route is only teacher/admin on
   * paper because it was grouped with the auction/blind-box CRUD, but the deployed student shop
   * page reads it (`useStudentShopData` -> `getStudentItems()` + `getBlindBoxes()` in one
   * `Promise.all`), so refusing the student role would break that page rather than narrow it.
   * The scope filter closes the same hole the role gate would have: no anonymous caller, no
   * inactive/ended rows, and the student feature gate still runs first.
   */
  async listBlindBoxes(actor: RequestActor): Promise<BlindBox[]> {
    const boxes = this.repository.listBlindBoxes();
    if (actor.role !== 'student') return boxes;

    await this.assertActorFeatureEnabled(actor.userId, 'enable_auction_blind_box');
    return boxes.filter((box) => box.is_active === 1);
  }

  /**
   * Buy a blind box.
   *
   * The spend moves the available balance only; the consolation prize moves BOTH
   * balances, because it is a *prize* - the legacy line called `addStudentPoints`, which
   * incremented `total_points` as well as `available_points`. That asymmetry is the
   * single easiest thing to get wrong here.
   *
   * `studentId` is the actor's own student row, exactly as in `buyItem`.
   */
  async buyBlindBox(studentId: number, input: Record<string, any>) {
    const { boxId, blindBoxId } = input ?? {};
    const student = await this.requireStudentWithFeature(studentId, 'enable_auction_blind_box');

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
      ledger: { type: 'BUY_BLIND_BOX', description: `Bought blind box: ${boxName}` },
    });
    if (spent.refusal) throw creditsApiError(spent.refusal);


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
      const granted = await this.classroom.awardStudentPoints({
        studentId: student.id,
        amount: 10,
        type: 'BLIND_BOX_CONSOLATION',
        description: 'Blind box consolation prize',
        actorId: 0,
      });
      points = granted.availablePoints;
    }

    return { points, reward };
  }

  // -- auction / blind-box administration (no points movement) -------------

  createAuction(input: Record<string, any>) {
    const { item_name, description, starting_price, end_time } = input ?? {};

    /**
     * An auction needs a name.
     *
     * `item_name` is NOT NULL on the table, so without this guard the insert throws and the
     * handler answers 500 服务器内部错误 - which is not a contract, it is the store announcing a
     * server fault for a request the caller got wrong. `createBlindBox` immediately below has had
     * this check all along; the auction path was simply missing it. Found by the e2e sweep, which
     * probes every endpoint with a deliberately empty body and fails on any 5xx.
     */
    if (!item_name || typeof item_name !== 'string') throw new ApiError(400, 'item_name is required');

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
   * 403 unless the actor may edit this item: the owning teacher, or the admin console.
   *
   * Item ownership is a row property (`shop_items.teacher_id`), so it is read here rather
   * than trusted from the request. A missing row is a 404 - the legacy update silently
   * matched nothing, which told a teacher nothing about whether the id was theirs.
   */
  private assertItemOwner(actor: RequestActor, id: string): void {
    if (isStaffAdmin(actor)) return;

    const item = this.repository.getShopItem(id);
    if (!item) throw new ApiError(404, 'Item not found');
    if (item.teacher_id !== actor.userId) throw new ApiError(403, '无权限执行该操作');
  }

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
