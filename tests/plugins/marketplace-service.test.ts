/**
 * MarketplaceService unit tests.
 *
 * Rewritten for the plugin world. The pre-migration test
 * (`api/modules/marketplace/marketplace.service.test.ts`) mocked the raw `db`, the
 * `pointsService` helpers and the feature facade; all three are gone. The service now
 * takes a repository (its own four tables), a `ClassroomPort` (the student balance, the
 * feature gates, the shared ledger) and an injectable random source.
 *
 * The point of this file is the balance semantics. The legacy code mixed two
 * operations that look interchangeable and are not:
 *
 *   - spends and refunds moved `available_points` ONLY
 *     (`spendStudentPoints` and one raw `UPDATE students SET available_points = ...`);
 *   - the blind-box consolation moved BOTH balances (`addStudentPoints`).
 *
 * Every test below therefore asserts `totalPoints` and `availablePoints` separately: a
 * wrong port call would still produce the expected `points` response while silently
 * corrupting a student's lifetime points, and no other test in the repo would notice.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { Auction, BlindBox, ShopItem } from '@thinkclass/contracts/domains/marketplace';
import { ApiError, openDatabase } from '@thinkclass/kernel';
import { createDbApi, TableOwnershipError } from '@thinkclass/plugin-runtime';

import { createMarketplaceRepository } from '../../plugins/marketplace/src/marketplace.repository.js';
import { MarketplaceService } from '../../plugins/marketplace/src/marketplace.service.js';
import type { RequestActor } from '../../plugins/marketplace/src/marketplace.authorization.js';
import type { MarketplaceRepository } from '../../plugins/marketplace/src/marketplace.types.js';

/**
 * Actors, shaped the way `marketplace.authorization.ts` builds them from the kernel context: a
 * student actor carries BOTH `userId` (the login) and `studentId` (the `students` row), and the
 * two are deliberately different numbers here - conflating them is the defect this round fixed.
 */
function student(studentId: number, userId: number): RequestActor {
  return { userId, role: 'student', studentId, classId: 3 };
}

function teacher(userId = 7): RequestActor {
  return { userId, role: 'teacher', studentId: null, classId: null };
}

function admin(userId = 1): RequestActor {
  return { userId, role: 'admin', studentId: null, classId: null };
}

/** The HTTP status of the `ApiError` a synchronous service call throws, or null when it does not. */
function statusOf(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof ApiError ? error.status : null;
  }
}

/** A shop item row as the legacy test data shaped it. */
function item(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: 10,
    name: '铅笔',
    description: '',
    price: 50,
    stock: 3,
    is_active: 1,
    teacher_id: 7,
    is_holiday_limited: 0,
    ...overrides,
  };
}

function auction(overrides: Partial<Auction> = {}): Auction {
  return {
    id: 5,
    item_name: '限量徽章',
    description: '',
    starting_price: 10,
    current_price: 80,
    highest_bidder_id: 2,
    status: 'active',
    end_time: null as unknown as string,
    ...overrides,
  };
}

function blindBox(overrides: Partial<BlindBox> = {}): BlindBox {
  return { id: 3, name: '神秘盲盒B', description: '', price: 40, is_active: 1, ...overrides };
}

class FakeMarketplaceRepository implements MarketplaceRepository {
  items: ShopItem[] = [];
  auctions: Auction[] = [];
  boxes: BlindBox[] = [];
  tickets: Array<{ studentId: number; itemId: unknown; code: string }> = [];
  teachers: Array<{ id: number }> = [{ id: 7 }];
  nextId = 1000;
  /** When true, the ticket insert inside `buyItem` fails, for compensation tests. */
  failTicketInsert = false;

  /**
   * Emulates better-sqlite3's `transaction`: the two platform writes roll back
   * together. The real rollback lives in the database; what this proves is that the
   * *service* compensates the debit once the transaction has thrown.
   */
  transaction<T>(fn: () => T): T {
    const items = this.items.map((entry) => ({ ...entry }));
    const tickets = [...this.tickets];
    try {
      return fn();
    } catch (error) {
      this.items = items;
      this.tickets = tickets;
      throw error;
    }
  }

  listShopItemsByTeacher(teacherId: number | null) {
    return this.items.filter(
      (entry) => entry.teacher_id === teacherId && (entry.stock > 0 || entry.stock === -1) && entry.is_active === 1,
    );
  }

  listActiveShopItems() {
    return this.items.filter((entry) => (entry.stock > 0 || entry.stock === -1) && entry.is_active === 1);
  }

  listAllShopItems(teacherId?: unknown) {
    const all = [...this.items].sort((a, b) => b.id - a.id);
    return teacherId ? all.filter((entry) => entry.teacher_id === teacherId) : all;
  }

  getShopItem(itemId: unknown) {
    return this.items.find((entry) => entry.id === Number(itemId)) ?? null;
  }

  createShopItem(input: Record<string, any>) {
    const id = this.nextId++;
    this.items.push({ ...input, id } as ShopItem);
    return id;
  }

  updateShopItemStatus(id: unknown, isActive: unknown) {
    const entry = this.getShopItem(id);
    if (entry) entry.is_active = Number(isActive);
  }

  updateShopItem(id: unknown, input: Record<string, any>) {
    const entry = this.getShopItem(id);
    if (entry) Object.assign(entry, input);
  }

  decrementShopItemStock(itemId: unknown) {
    const entry = this.getShopItem(itemId);
    if (entry) entry.stock -= 1;
  }

  insertRedemptionTicket(studentId: number, itemId: unknown, code: string) {
    if (this.failTicketInsert) throw new Error('sqlite: disk I/O error');
    this.tickets.push({ studentId, itemId, code });
  }

  findFirstTeacherId() {
    return this.teachers[0]?.id ?? null;
  }

  listAuctions() {
    return [...this.auctions].sort((a, b) => b.id - a.id);
  }

  getAuction(id: unknown) {
    return this.auctions.find((entry) => entry.id === Number(id)) ?? null;
  }

  createAuction(input: Record<string, any>) {
    const id = this.nextId++;
    this.auctions.push({
      id,
      item_name: input.item_name,
      description: input.description,
      starting_price: input.starting_price,
      current_price: input.starting_price,
      highest_bidder_id: null,
      status: 'active',
      end_time: input.end_time,
    } as Auction);
    return id;
  }

  updateAuction(id: unknown, input: Record<string, any>) {
    const entry = this.getAuction(id);
    if (entry) Object.assign(entry, input);
  }

  setAuctionLeader(id: unknown, currentPrice: number, bidderId: number) {
    const entry = this.getAuction(id);
    if (entry) {
      entry.current_price = currentPrice;
      entry.highest_bidder_id = bidderId;
    }
  }

  deleteAuction(id: unknown) {
    this.auctions = this.auctions.filter((entry) => entry.id !== Number(id));
  }

  listBlindBoxes() {
    return [...this.boxes].sort((a, b) => b.id - a.id);
  }

  getBlindBox(id: unknown) {
    return this.boxes.find((entry) => entry.id === Number(id)) ?? null;
  }

  createBlindBox(input: Record<string, any>) {
    const id = this.nextId++;
    this.boxes.push({ ...input, id } as BlindBox);
    return id;
  }

  updateBlindBox(id: unknown, input: Record<string, any>) {
    const entry = this.getBlindBox(id);
    if (entry) Object.assign(entry, input);
  }

  deleteBlindBox(id: unknown) {
    this.boxes = this.boxes.filter((entry) => entry.id !== Number(id));
  }
}

/**
 * A fake classroom: the balance and the ledger live here, exactly as they do behind the
 * real port. Crucially, `transferStudentCredits` moves ONLY `availablePoints` while
 * `adjustPoints` moves BOTH - the same split the real port implements, so a test can
 * tell the two apart.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): marketplace never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, { snapshot: StudentSnapshot; features: Set<string> }>();
  userIds = new Map<number, number>();
  ledger: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  /** When set, `transferStudentCredits` refuses for that student only. */
  failCreditsFor: number | null = null;
  failCreditsRefusal: ClassroomRefusal = { code: 'insufficient-credits', message: '积分不足' };

  async getStudentById(studentId: number) {
    return this.students.get(studentId)?.snapshot ?? null;
  }

  async getStudentByUserId(userId: number) {
    const studentId = this.userIds.get(userId);
    return studentId === undefined ? null : this.getStudentById(studentId);
  }

  async getClassById(classId: number) {
    return classId === 3 ? { id: 3, name: '一班', teacherId: 7, inviteCode: 'ABC' } : null;
  }

  async listClassStudents(classId: number) {
    return [...this.students.values()].map((entry) => entry.snapshot).filter((s) => s.classId === classId);
  }

  async searchClasses() {
    return [];
  }

  async assertStudentInClass(studentId: number, classId: number) {
    const entry = this.students.get(studentId);
    if (!entry || entry.snapshot.classId !== classId) throw new Error('not in class');
  }

  async adjustPoints(input: { studentId: number; delta: number }) {
    const entry = this.students.get(input.studentId);
    if (!entry) throw new Error('missing student');
    entry.snapshot = {
      ...entry.snapshot,
      totalPoints: entry.snapshot.totalPoints + input.delta,
      availablePoints: entry.snapshot.availablePoints + input.delta,
    };
    return { totalPoints: entry.snapshot.totalPoints, availablePoints: entry.snapshot.availablePoints };
  }

  async awardStudentPoints(input: { studentId: number; amount: number; type: string; description: string }) {
    const result = await this.adjustPoints({ studentId: input.studentId, delta: input.amount });
    await this.recordStudentLedgerEntry({ studentId: input.studentId, type: input.type, amount: input.amount, description: input.description });
    return result;
  }

  async transferStudentCredits(input: { studentId: number; delta: number; reason: string; ledger?: { type: string; description: string } }) {
    if (this.failCreditsFor === input.studentId) return { refusal: this.failCreditsRefusal };
    const entry = this.students.get(input.studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };

    const available = entry.snapshot.availablePoints + input.delta;
    if (available < 0) return { refusal: { code: 'insufficient-credits' as const, message: '积分不足' } };

    // Only the spendable half moves - `totalPoints` is untouched, exactly like the
    // real port and exactly like the legacy `spendStudentPoints`.
    entry.snapshot = { ...entry.snapshot, availablePoints: available };
    this.ledger.push({ studentId: input.studentId, type: input.ledger?.type ?? input.reason.toUpperCase().replace(/\./g, '_'), amount: input.delta, description: input.ledger?.description ?? input.reason });
    return { value: { availablePoints: available } };
  }

  async recordStudentLedgerEntry(entry: { studentId: number; type: string; amount: number; description: string }) {
    this.ledger.push(entry);
  }

  async listStudentLedger() {
    return [];
  }

  async sumClassPointsEarnedSince() {
    return 0;
  }

  async checkStudentFeature(studentId: number, feature: string) {
    const entry = this.students.get(studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    if (!entry.features.has(feature)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }

  async checkClassFeature() {
    return { value: true as const };
  }

  async checkAnyClassFeature() {
    return { value: true as const };
  }
}

function setup(options: { random?: number } = {}) {
  const repository = new FakeMarketplaceRepository();
  const classroom = new FakeClassroom();
  classroom.students.set(1, {
    snapshot: { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 200 },
    features: new Set(['enable_shop', 'enable_auction_blind_box']),
  });
  classroom.students.set(2, {
    snapshot: { id: 2, classId: 3, userId: 200, name: '小红', totalPoints: 300, availablePoints: 150 },
    features: new Set(['enable_shop', 'enable_auction_blind_box']),
  });
  classroom.userIds.set(100, 1);
  classroom.userIds.set(200, 2);

  return {
    repository,
    classroom,
    service: new MarketplaceService(repository, classroom, () => options.random ?? 0.9),
  };
}

const balances = (classroom: FakeClassroom, studentId: number) => {
  const snapshot = classroom.students.get(studentId)!.snapshot;
  return { total: snapshot.totalPoints, available: snapshot.availablePoints };
};

describe('MarketplaceService shop items', () => {
  let repository: FakeMarketplaceRepository;
  let classroom: FakeClassroom;
  let service: MarketplaceService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('resolves a student to their class teacher items through the port', async () => {
    repository.items = [item({ id: 10, teacher_id: 7 }), item({ id: 11, teacher_id: 9 }), item({ id: 12, teacher_id: 7, is_active: 0 })];

    const items = await service.listItems(student(1, 100));
    expect(items.map((entry) => entry.id)).toEqual([10]);
  });

  /**
   * The scope is the actor's, not the query's. Before this round `listItems(undefined, null)`
   * answered every active item in the database, which is how an anonymous caller (or a student
   * who simply omitted `?studentId=`) read other teachers' shelves.
   */
  it('scopes the shelf to the actor instead of trusting the request', async () => {
    repository.items = [item({ id: 10, teacher_id: 7 }), item({ id: 11, teacher_id: 9 })];

    expect((await service.listItems(teacher(7))).map((entry) => entry.id)).toEqual([10]);
    expect((await service.listItems(teacher(9))).map((entry) => entry.id)).toEqual([11]);
    // admin/superadmin are the only roles that see the whole table.
    expect((await service.listItems(admin())).map((entry) => entry.id)).toEqual([10, 11]);
  });

  it('answers an empty shelf - never the global list - when a student has no resolved row', async () => {
    repository.items = [item({ id: 10, teacher_id: 7 })];

    // The feature gate resolves the login, so this actor is a real student; the *scope* is what
    // failed to resolve. Failing open here would hand them every teacher's items.
    expect(await service.listItems({ userId: 100, role: 'student', studentId: null, classId: null })).toEqual([]);
  });

  it('gates a student actor by resolving user id -> student through the port', async () => {
    classroom.students.get(1)!.features = new Set();

    await expect(service.listItems(student(1, 100))).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
    // `getClassIdByUserId`'s message for a user id with no student row.
    await expect(service.listItems(student(1, 999))).rejects.toMatchObject({ status: 404, message: '班级未找到' });
  });

  it('validates createItem input and falls back to the first teacher', () => {
    expect(() => service.createItem(teacher(7), { name: 'A', price: 5 })).toThrow(ApiError);
    expect(() => service.createItem(teacher(7), { name: 'A', price: 5 })).toThrow('Invalid input');
    expect(() => service.createItem(teacher(7), { name: '', price: 5, stock: 1 })).toThrow('Invalid input');
    expect(() => service.createItem(teacher(7), { name: 'A', price: 5, stock: -2 })).toThrow('Invalid input');

    const created = service.createItem(teacher(7), { name: 'A', price: 5, stock: 1 });
    expect(created.id).toBe(1000);
    expect(repository.items[0]).toMatchObject({ name: 'A', price: 5, stock: 1, is_active: 1, teacher_id: 7 });
  });

  it('creates an item on the caller own shelf, ignoring a teacher_id in the body', () => {
    service.createItem(teacher(7), { name: 'A', price: 5, stock: 1, teacher_id: 9 });
    expect(repository.items[0]).toMatchObject({ teacher_id: 7 });

    // admin/superadmin have no shelf of their own, so they may name a seller; with none named the
    // legacy "first teacher in the database" default still applies.
    service.createItem(admin(), { name: 'B', price: 5, stock: 1, teacher_id: 9 });
    expect(repository.items[1]).toMatchObject({ teacher_id: 9 });
    service.createItem(admin(), { name: 'C', price: 5, stock: 1 });
    expect(repository.items[2]).toMatchObject({ teacher_id: 7 });
  });

  it('keeps the legacy update defaults (a missing is_active deactivates a blind box)', () => {
    repository.items = [item({ id: 10, is_active: 1 })];
    service.updateItemStatus(admin(), '10', {});
    expect(repository.getShopItem(10)!.is_active).toBe(0);

    repository.boxes = [blindBox({ id: 3, is_active: 1 })];
    service.updateBlindBox('3', { name: 'B', description: '', price: 20 });
    expect(repository.getBlindBox(3)!.is_active).toBe(0);

    service.createBlindBox({ name: 'C', price: 30 });
    expect(repository.boxes.find((box) => box.name === 'C')!.is_active).toBe(1);
    expect(() => service.createBlindBox({ name: 'C', price: '30' })).toThrow('Invalid input');
  });

  /**
   * `shop_items.teacher_id` is the ownership boundary: the shelf is per teacher, so editing
   * another teacher's item is a 403, and an id that does not exist is a 404 rather than the
   * legacy silent no-op.
   */
  it('lets only the owning teacher (or admin) edit an item', () => {
    repository.items = [item({ id: 10, teacher_id: 7 })];

    service.updateItemStatus(teacher(7), '10', { is_active: 0 });
    expect(repository.getShopItem(10)!.is_active).toBe(0);

    expect(statusOf(() => service.updateItemStatus(teacher(9), '10', { is_active: 1 }))).toBe(403);
    expect(statusOf(() => service.updateItem(teacher(9), '10', { name: '偷改' }))).toBe(403);
    expect(repository.getShopItem(10)!.is_active).toBe(0);

    expect(statusOf(() => service.updateItem(teacher(7), '999', { name: 'x' }))).toBe(404);
    // The admin console edits anything.
    service.updateItem(admin(), '10', { name: '改好了' });
    expect(repository.getShopItem(10)!.name).toBe('改好了');
  });
});

describe('MarketplaceService.buyItem', () => {
  let repository: FakeMarketplaceRepository;
  let classroom: FakeClassroom;
  let service: MarketplaceService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
    repository.items = [item()];
  });

  it('moves ONLY available_points and writes the ledger row through the port', async () => {
    const result = await service.buyItem(1, { itemId: 10 });

    expect(result).toEqual({ points: 150 });
    // The risky half: a spend must not touch the lifetime figure.
    expect(balances(classroom, 1)).toEqual({ total: 500, available: 150 });
    expect(repository.getShopItem(10)!.stock).toBe(2);
    expect(repository.tickets).toHaveLength(1);
    expect(repository.tickets[0].code).toMatch(/^RED-/);
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'BUY_ITEM', amount: -50, description: 'Bought item: 铅笔' },
    ]);
  });

  it('does not decrement an unlimited-stock item', async () => {
    repository.items = [item({ stock: -1 })];
    await service.buyItem(1, { itemId: 10 });
    expect(repository.getShopItem(10)!.stock).toBe(-1);
  });

  it('refuses an overdraft without writing anything', async () => {
    classroom.students.get(1)!.snapshot = { ...classroom.students.get(1)!.snapshot, availablePoints: 10 };

    await expect(service.buyItem(1, { itemId: 10 })).rejects.toMatchObject({
      status: 400,
      message: 'Not enough points',
    });

    expect(balances(classroom, 1)).toEqual({ total: 500, available: 10 });
    expect(repository.tickets).toHaveLength(0);
    expect(classroom.ledger).toHaveLength(0);
  });

  it('refunds the debit when the ticket write fails', async () => {
    repository.failTicketInsert = true;

    await expect(service.buyItem(1, { itemId: 10 })).rejects.toThrow('disk I/O error');

    // The debit is compensated and the platform write rolled back: no charge, no ticket.
    expect(balances(classroom, 1)).toEqual({ total: 500, available: 200 });
    expect(repository.tickets).toHaveLength(0);
    expect(repository.getShopItem(10)!.stock).toBe(3);
    expect(classroom.ledger.map((entry) => [entry.type, entry.amount])).toEqual([
      ['BUY_ITEM', -50],
      ['MARKETPLACE_BUY_ITEM_ROLLBACK', 50],
    ]);
  });

  it('keeps the stock, active and holiday-window checks in the legacy order', async () => {
    repository.items = [item({ id: 10, stock: 0 })];
    await expect(service.buyItem(1, { itemId: 10 })).rejects.toThrow('Item out of stock');

    repository.items = [item({ id: 10, is_active: 0 })];
    await expect(service.buyItem(1, { itemId: 10 })).rejects.toThrow('Item is not active');

    repository.items = [
      item({ id: 10, is_holiday_limited: 1, holiday_start_time: '2999-01-01T00:00:00.000Z' }),
    ];
    await expect(service.buyItem(1, { itemId: 10 })).rejects.toThrow(
      'This item is not yet available for purchase',
    );

    repository.items = [
      item({ id: 10, is_holiday_limited: 1, holiday_end_time: '2000-01-01T00:00:00.000Z' }),
    ];
    await expect(service.buyItem(1, { itemId: 10 })).rejects.toThrow(
      'This item is no longer available for purchase',
    );

    expect(classroom.ledger).toHaveLength(0);
  });

  it('gates the feature, then the student, before any write', async () => {
    classroom.students.get(1)!.features = new Set();
    await expect(service.buyItem(1, { itemId: 10 })).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });

    await expect(service.buyItem(999, { itemId: 10 })).rejects.toMatchObject({
      status: 404,
      message: '学生未找到',
    });
    expect(repository.tickets).toHaveLength(0);
  });
});

describe('MarketplaceService.bidAuction', () => {
  let repository: FakeMarketplaceRepository;
  let classroom: FakeClassroom;
  let service: MarketplaceService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
    repository.auctions = [auction()];
  });

  it('refunds the outbid student on the available balance only, then debits the bidder', async () => {
    const result = await service.bidAuction(1, '5', { bid_amount: 100 });

    expect(result).toEqual({ points: 100 });
    // Bidder: available only.
    expect(balances(classroom, 1)).toEqual({ total: 500, available: 100 });
    // Outbid student: the legacy line was a raw `available_points + ?` UPDATE, so the
    // lifetime figure must not move here either.
    expect(balances(classroom, 2)).toEqual({ total: 300, available: 230 });

    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'AUCTION_BID', amount: -100, description: 'Placed bid on auction: 限量徽章' },
      { studentId: 2, type: 'AUCTION_REFUND', amount: 80, description: 'Refund for outbid on auction: 限量徽章' },
    ]);
    expect(repository.getAuction(5)).toMatchObject({ current_price: 100, highest_bidder_id: 1 });
  });

  it('writes nothing when the credit transfer is refused (debit before refund)', async () => {
    classroom.failCreditsFor = 1;
    classroom.failCreditsRefusal = { code: 'insufficient-credits', message: '积分不足' };

    await expect(service.bidAuction(1, '5', { bid_amount: 100 })).rejects.toMatchObject({
      status: 400,
      message: 'Not enough points',
    });

    // The outbid student was NOT refunded: with two port calls, refunding first would
    // let the same standing bid be refunded twice on a later attempt.
    expect(balances(classroom, 1)).toEqual({ total: 500, available: 200 });
    expect(balances(classroom, 2)).toEqual({ total: 300, available: 150 });
    expect(classroom.ledger).toHaveLength(0);
    expect(repository.getAuction(5)).toMatchObject({ current_price: 80, highest_bidder_id: 2 });
  });

  it('compensates the debit when the refund is refused', async () => {
    classroom.failCreditsFor = 2;
    classroom.failCreditsRefusal = { code: 'student-not-found', message: '学生未找到' };

    await expect(service.bidAuction(1, '5', { bid_amount: 100 })).rejects.toMatchObject({
      status: 404,
      message: 'Student not found',
    });

    expect(balances(classroom, 1)).toEqual({ total: 500, available: 200 });
    expect(balances(classroom, 2)).toEqual({ total: 300, available: 150 });
    expect(classroom.ledger.map((entry) => [entry.type, entry.amount])).toEqual([
      ['AUCTION_BID', -100],
      ['MARKETPLACE_AUCTION_BID_ROLLBACK', 100],
    ]);
    expect(repository.getAuction(5)).toMatchObject({ current_price: 80, highest_bidder_id: 2 });
  });

  it('keeps the legacy validation order and messages', async () => {
    await expect(service.bidAuction(1, '999', { bid_amount: 100 })).rejects.toThrow(
      'Auction not found',
    );

    repository.auctions = [auction({ status: 'ended' })];
    await expect(service.bidAuction(1, '5', { bid_amount: 100 })).rejects.toThrow('Auction is not active');

    repository.auctions = [auction({ end_time: '2000-01-01T00:00:00.000Z' as unknown as string })];
    await expect(service.bidAuction(1, '5', { bid_amount: 100 })).rejects.toThrow('Auction has ended');

    repository.auctions = [auction()];
    await expect(service.bidAuction(1, '5', { bid_amount: 80 })).rejects.toThrow(
      'Bid amount must be greater than current price: 80',
    );

    // A missing bid passes the two comparisons the legacy code made first (both are
    // `false` for `undefined`) and is then rejected by the amount validation, exactly
    // as `spendStudentPoints` did.
    await expect(service.bidAuction(1, '5', {})).rejects.toThrow('Invalid amount');
  });

  it('lets the standing highest bidder raise their own bid without a refund', async () => {
    repository.auctions = [auction({ highest_bidder_id: 1 })];
    await service.bidAuction(1, '5', { bid_amount: 100 });

    expect(balances(classroom, 1)).toEqual({ total: 500, available: 100 });
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'AUCTION_BID', amount: -100, description: 'Placed bid on auction: 限量徽章' },
    ]);
  });

  it('gates the auction feature before reading the auction', async () => {
    classroom.students.get(1)!.features = new Set();
    await expect(service.bidAuction(1, '5', { bid_amount: 100 })).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
    expect(repository.getAuction(5)).toMatchObject({ current_price: 80, highest_bidder_id: 2 });
  });
});

describe('MarketplaceService.buyBlindBox', () => {
  let repository: FakeMarketplaceRepository;
  let classroom: FakeClassroom;

  beforeEach(() => {
    ({ repository, classroom } = setup());
  });

  it('moves BOTH balances for the consolation prize and available only for the purchase', async () => {
    const service = new MarketplaceService(repository, classroom, () => 0.9);

    const result = await service.buyBlindBox(1, {});

    expect(result).toEqual({ points: 110, reward: '谢谢参与 (获得安慰奖 10积分)' });
    // 200 - 100 + 10 available, and 500 + 10 total: the legacy console used
    // `addStudentPoints`, which is `adjustPoints` behind the port. Using
    // `transferStudentCredits` here would leave total at 500 - a silent regression.
    expect(balances(classroom, 1)).toEqual({ total: 510, available: 110 });
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'BUY_BLIND_BOX', amount: -100, description: 'Bought blind box: 神秘盲盒' },
      { studentId: 1, type: 'BLIND_BOX_CONSOLATION', amount: 10, description: 'Blind box consolation prize' },
    ]);
  });

  it('moves only the available balance for a winning roll', async () => {
    const service = new MarketplaceService(repository, classroom, () => 0);

    const result = await service.buyBlindBox(1, {});

    expect(result).toEqual({ points: 100, reward: '稀有碎片 x1' });
    expect(balances(classroom, 1)).toEqual({ total: 500, available: 100 });
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'BUY_BLIND_BOX', amount: -100, description: 'Bought blind box: 神秘盲盒' },
    ]);
  });

  it('uses a requested box price and keeps the box lookup messages', async () => {
    repository.boxes = [blindBox({ id: 3, price: 40 }), blindBox({ id: 4, name: '停售盒', is_active: 0 })];
    const service = new MarketplaceService(repository, classroom, () => 0.2);

    // `blindBoxId` is the legacy alias for `boxId`.
    expect(await service.buyBlindBox(1, { blindBoxId: 3 })).toEqual({
      points: 160,
      reward: '普通碎片 x2',
    });

    await expect(service.buyBlindBox(1, { boxId: 999 })).rejects.toThrow('Blind box not found');
    await expect(service.buyBlindBox(1, { boxId: 4 })).rejects.toThrow('Blind box is not active');
  });

  it('refuses an overdraft before spending anything', async () => {
    classroom.students.get(1)!.snapshot = { ...classroom.students.get(1)!.snapshot, availablePoints: 5 };
    const service = new MarketplaceService(repository, classroom, () => 0.9);

    await expect(service.buyBlindBox(1, {})).rejects.toMatchObject({
      status: 400,
      message: 'Not enough points',
    });
    expect(balances(classroom, 1)).toEqual({ total: 500, available: 5 });
    expect(classroom.ledger).toHaveLength(0);
  });
});

describe('MarketplaceService auction administration', () => {
  let repository: FakeMarketplaceRepository;
  let classroom: FakeClassroom;
  let service: MarketplaceService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('creates auctions with the legacy defaults', () => {
    expect(service.createAuction({ item_name: '徽章' })).toEqual({ id: 1000 });
    expect(repository.auctions[0]).toMatchObject({
      item_name: '徽章',
      description: '',
      starting_price: 0,
      current_price: 0,
      end_time: null,
    });
    expect(service.createAuction({ item_name: 'B', description: 'd', starting_price: 5 })).toEqual({ id: 1001 });
    expect(repository.auctions[1]).toMatchObject({ description: 'd', starting_price: 5, current_price: 5 });
  });

  it('updates and deletes auctions and blind boxes', () => {
    repository.auctions = [auction({ id: 5, current_price: 80 })];
    service.updateAuction('5', { item_name: '改名', starting_price: 3, status: 'ended' });
    expect(repository.getAuction(5)).toMatchObject({ item_name: '改名', starting_price: 3, status: 'ended' });
    service.deleteAuction('5');
    expect(repository.auctions).toHaveLength(0);

    repository.boxes = [blindBox({ id: 3 })];
    service.updateBlindBox('3', { name: '新盒', description: 'd', price: 12, is_active: 1 });
    expect(repository.getBlindBox(3)).toMatchObject({ name: '新盒', price: 12, is_active: 1 });
    service.deleteBlindBox('3');
    expect(repository.boxes).toHaveLength(0);
  });

  it('lists auctions and blind boxes behind the actor gate', async () => {
    repository.auctions = [auction({ id: 5 }), auction({ id: 6 })];
    repository.boxes = [blindBox({ id: 3 }), blindBox({ id: 4, is_active: 0 })];

    // Teachers and admins read the board; the feature flag is a *student* gate, which is why
    // the same call is then refused for the student actor alone.
    expect(await service.listAuctions(teacher(7))).toHaveLength(2);
    expect(await service.listAuctions(admin())).toHaveLength(2);
    expect((await service.listAuctions(student(1, 100))).map((entry) => entry.id)).toEqual([6, 5]);

    // Staff get the management listing (inactive boxes included); a student gets the shop
    // listing - active boxes only - because the student shop page reads this same route.
    expect((await service.listBlindBoxes(teacher(7))).map((entry) => entry.id)).toEqual([4, 3]);
    expect((await service.listBlindBoxes(student(1, 100))).map((entry) => entry.id)).toEqual([3]);

    classroom.students.get(1)!.features = new Set();
    await expect(service.listAuctions(student(1, 100))).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
    await expect(service.listBlindBoxes(student(1, 100))).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
  });
});

/**
 * The ownership declaration is the security boundary, so it is worth proving the
 * plugin's `DbApi` is what the repository actually reaches for - and that the SQL never
 * names `students`, `classes` or `records`, which belong to classroom.
 */
describe('createMarketplaceRepository statement scope', () => {
  it('touches only the tables the manifest declares', () => {
    const seen: string[] = [];
    const stub = {
      get: (sql: string) => {
        seen.push(sql);
        return undefined;
      },
      query: (sql: string) => {
        seen.push(sql);
        return [];
      },
      run: (sql: string) => {
        seen.push(sql);
        return { changes: 0, lastInsertRowid: 0 };
      },
      tx: <T>(fn: (tx: unknown) => T) => fn(stub),
      exec: () => {},
    };

    const repository = createMarketplaceRepository(stub as never);
    repository.listShopItemsByTeacher(7);
    repository.listActiveShopItems();
    repository.listAllShopItems(7);
    repository.listAllShopItems();
    repository.getShopItem(1);
    repository.createShopItem({
      name: 'A',
      description: '',
      price: 1,
      stock: 1,
      is_active: 1,
      teacher_id: 7,
      is_holiday_limited: 0,
      holiday_start_time: null,
      holiday_end_time: null,
    });
    repository.updateShopItemStatus(1, 1);
    repository.updateShopItem(1, {
      name: 'A',
      description: '',
      price: 1,
      stock: 1,
      is_holiday_limited: 0,
      holiday_start_time: null,
      holiday_end_time: null,
    });
    repository.decrementShopItemStock(1);
    repository.insertRedemptionTicket(1, 1, 'RED-X');
    repository.findFirstTeacherId();
    repository.listAuctions();
    repository.getAuction(1);
    repository.createAuction({ item_name: 'A', description: '', starting_price: 1, end_time: null });
    repository.updateAuction(1, { item_name: 'A', description: '', starting_price: 1, status: 'active', end_time: null });
    repository.setAuctionLeader(1, 2, 1);
    repository.deleteAuction(1);
    repository.listBlindBoxes();
    repository.getBlindBox(1);
    repository.createBlindBox({ name: 'A', description: '', price: 1, is_active: 1 });
    repository.updateBlindBox(1, { name: 'A', description: '', price: 1, is_active: 1 });
    repository.deleteBlindBox(1);
    repository.transaction(() => repository.listAuctions());

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    // Exactly `data.adopted` plus the declared read of `users`.
    expect([...touched].sort()).toEqual([
      'auctions',
      'blind_boxes',
      'redemption_tickets',
      'shop_items',
      'users',
    ]);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('classes');
    expect([...touched]).not.toContain('records');
  });
});

/**
 * The repository driven through a *real* `DbApi` in strict mode over in-memory SQLite.
 * This is what the plugin runtime hands `createMarketplaceRepository` outside
 * production, so it is the check that every statement stays inside `data.adopted` - and,
 * unlike the name-shaped stub above, it also proves the SQL runs: a column that does not
 * exist or a syntax error fails here.
 */
describe('createMarketplaceRepository against a real ownership-checked DbApi', () => {
  function setupDb() {
    const db = openDatabase(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        username TEXT UNIQUE
      );
      CREATE TABLE shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        stock INTEGER DEFAULT 999,
        is_active INTEGER DEFAULT 1,
        teacher_id INTEGER REFERENCES users(id),
        is_holiday_limited INTEGER DEFAULT 0,
        holiday_start_time TEXT,
        holiday_end_time TEXT
      );
      CREATE TABLE redemption_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        item_id INTEGER REFERENCES shop_items(id),
        code TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'pending',
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE auctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        description TEXT,
        starting_price INTEGER NOT NULL DEFAULT 0,
        current_price INTEGER NOT NULL DEFAULT 0,
        highest_bidder_id INTEGER,
        status TEXT DEFAULT 'active',
        end_time DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE blind_boxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL DEFAULT 100,
        teacher_id INTEGER REFERENCES users(id),
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users (id, role, username) VALUES (7, 'teacher', 't');
      INSERT INTO shop_items (name, description, price, stock, is_active, teacher_id)
        VALUES ('铅笔', '', 50, 2, 1, 7);
      INSERT INTO auctions (id, item_name, description, starting_price, current_price, highest_bidder_id, status)
        VALUES (5, '限量徽章', '', 10, 80, 2, 'active');
    `);

    const api = createDbApi({
      db,
      pluginId: 'marketplace',
      // Exactly `data.adopted` from plugins/marketplace/plugin.json.
      ownedTables: new Set(['auctions', 'blind_boxes', 'shop_items', 'redemption_tickets']),
      readTables: new Set(['users']),
      strict: true,
    });
    return { db, api };
  }

  function classroom() {
    const fake = new FakeClassroom();
    fake.students.set(1, {
      snapshot: { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 200 },
      features: new Set(['enable_shop', 'enable_auction_blind_box']),
    });
    fake.students.set(2, {
      snapshot: { id: 2, classId: 3, userId: 200, name: '小红', totalPoints: 300, availablePoints: 150 },
      features: new Set(['enable_shop', 'enable_auction_blind_box']),
    });
    return fake;
  }

  it('runs a purchase against the real tables', async () => {
    const { db, api } = setupDb();
    const fake = classroom();
    const service = new MarketplaceService(createMarketplaceRepository(api), fake, () => 0.9);

    await expect(service.buyItem(1, { itemId: 1 })).resolves.toEqual({ points: 150 });

    expect(db.prepare('SELECT stock FROM shop_items WHERE id = 1').get()).toEqual({ stock: 1 });
    expect(db.prepare('SELECT student_id, item_id, status FROM redemption_tickets').all()).toEqual([
      { student_id: 1, item_id: 1, status: 'pending' },
    ]);
    expect(fake.ledger).toEqual([
      { studentId: 1, type: 'BUY_ITEM', amount: -50, description: 'Bought item: 铅笔' },
    ]);
    // The balance itself is not in this database: classroom owns it.
    expect(fake.students.get(1)!.snapshot).toMatchObject({ totalPoints: 500, availablePoints: 150 });
  });

  it('runs a bid against the real tables', async () => {
    const { db, api } = setupDb();
    const fake = classroom();
    const service = new MarketplaceService(createMarketplaceRepository(api), fake, () => 0.9);

    await expect(service.bidAuction(1, '5', { bid_amount: 100 })).resolves.toEqual({ points: 100 });

    expect(db.prepare('SELECT current_price, highest_bidder_id FROM auctions WHERE id = 5').get()).toEqual({
      current_price: 100,
      highest_bidder_id: 1,
    });
    expect(fake.students.get(2)!.snapshot).toMatchObject({ totalPoints: 300, availablePoints: 230 });
  });

  it('refuses the writes the pre-migration service was allowed to make', () => {
    const { api } = setupDb();

    // The old module updated `students` directly and inserted into `records` through
    // `pointsService`. The ownership check is what stops the plugin reintroducing
    // either, and it runs before execution - neither table exists in this database.
    expect(() => api.run('UPDATE students SET available_points = available_points + ? WHERE id = ?', [10, 1])).toThrow(
      TableOwnershipError,
    );
    expect(() =>
      api.run('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)', [
        1,
        'AUCTION_REFUND',
        80,
        '',
      ]),
    ).toThrow(TableOwnershipError);
    // `classes` was joined by the old `listItems` query; it is not declared either.
    expect(() => api.query('SELECT * FROM classes')).toThrow(TableOwnershipError);
    expect(() => api.query('SELECT * FROM students WHERE id = ?', [1])).toThrow(TableOwnershipError);
  });
});
