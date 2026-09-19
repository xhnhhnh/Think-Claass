/**
 * EconomyService unit tests.
 *
 * Rewritten for the plugin world in P4.3b. The pre-migration test faked an
 * `EconomyRepository` that also owned `students` and `records`; both of those moved
 * behind `classroom.public`, so the test now fakes a *port* as well and can assert the
 * thing that actually matters: that the balance and the ledger are reached through the
 * port, and that a refused port operation does not leave a half-applied trade behind.
 *
 * The behavioural expectations are carried over unchanged from
 * `api/modules/economy/economy.service.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import { createEconomyRepository } from '../../plugins/economy/src/economy.repository.js';
import { EconomyService } from '../../plugins/economy/src/economy.service.js';
import type { EconomyRepository, PortfolioItemDto, StockDto, StockPayload, StockPricePayload } from '../../plugins/economy/src/economy.types.js';

class FakeEconomyRepository implements EconomyRepository {
  accounts = new Map<number, { student_id: number; deposit_amount: number; interest_rate: number; last_interest_date: string | null }>();
  stocks = new Map<number, StockDto>();
  holdings = new Map<string, { id: number; student_id: number; stock_id: number; shares: number; average_buy_price: number }>();
  nextStockId = 10;
  nextHoldingId = 20;

  getOrCreateBankAccount(studentId: number) {
    const existing = this.accounts.get(studentId);
    if (existing) return existing;
    const account = { student_id: studentId, deposit_amount: 0, interest_rate: 0.05, last_interest_date: null };
    this.accounts.set(studentId, account);
    return account;
  }
  listStocks(classId: number) {
    return [...this.stocks.values()].filter((stock) => stock.class_id === classId);
  }
  getStock(stockId: number) {
    return this.stocks.get(stockId) ?? null;
  }
  listPortfolio(studentId: number) {
    return [...this.holdings.values()]
      .filter((holding) => holding.student_id === studentId && holding.shares > 0)
      .map((holding) => {
        const stock = this.stocks.get(holding.stock_id)!;
        return { ...holding, name: stock.name, symbol: stock.symbol, current_price: stock.current_price } as PortfolioItemDto;
      });
  }
  updateBankDeposit(studentId: number, depositAmount: number) {
    const account = this.getOrCreateBankAccount(studentId);
    this.accounts.set(studentId, { ...account, deposit_amount: depositAmount });
  }
  getHolding(studentId: number, stockId: number) {
    return this.holdings.get(`${studentId}:${stockId}`) ?? null;
  }
  upsertHolding(studentId: number, stockId: number, shares: number, averageBuyPrice: number) {
    const key = `${studentId}:${stockId}`;
    const existing = this.holdings.get(key);
    this.holdings.set(key, {
      id: existing?.id ?? this.nextHoldingId++,
      student_id: studentId,
      stock_id: stockId,
      shares,
      average_buy_price: averageBuyPrice,
    });
  }
  deleteHolding(studentId: number, stockId: number) {
    this.holdings.delete(`${studentId}:${stockId}`);
  }
  updateHoldingShares(holdingId: number, shares: number) {
    for (const [key, holding] of this.holdings) {
      if (holding.id === holdingId) this.holdings.set(key, { ...holding, shares });
    }
  }
  triggerInterest() {}
  createStock(input: StockPayload) {
    const id = this.nextStockId++;
    this.stocks.set(id, { id, trend_history: JSON.stringify([input.current_price]), ...input });
    return id;
  }
  updateStock(stockId: number, input: Partial<StockPayload> | StockPricePayload) {
    const stock = this.stocks.get(stockId)!;
    const current_price = 'new_price' in input ? input.new_price : (input.current_price ?? stock.current_price);
    this.stocks.set(stockId, { ...stock, ...('new_price' in input ? {} : input), current_price });
  }
  deleteStock(stockId: number) {
    this.stocks.delete(stockId);
    for (const [key, holding] of this.holdings) {
      if (holding.stock_id === stockId) this.holdings.delete(key);
    }
  }
}

/**
 * A fake classroom: the student balance and the ledger live here, exactly as they do
 * behind the real port. `featureEnabled` is the class feature gate.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): economy never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, { snapshot: StudentSnapshot; featureEnabled: boolean }>();
  ledger: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  /** Set to make `transferStudentCredits` reject, for compensation tests. */
  failCredits: ClassroomRefusal | null = null;

  async getStudentById(studentId: number) {
    return this.students.get(studentId)?.snapshot ?? null;
  }
  async getStudentByUserId(userId: number) {
    for (const entry of this.students.values()) {
      if (entry.snapshot.userId === userId) return entry.snapshot;
    }
    return null;
  }
  async searchClasses() {
    return [];
  }
  async getClassById(classId: number) {
    return classId === 3 ? { id: 3, name: '一班', teacherId: 7, inviteCode: 'ABC' } : null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()].map((entry) => entry.snapshot).filter((s) => s.classId === classId);
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const entry = this.students.get(studentId);
    if (!entry || entry.snapshot.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints() {
    throw new Error('not used by economy');
  }
  async transferStudentCredits(input: { studentId: number; delta: number }) {
    if (this.failCredits) return { refusal: this.failCredits };
    const entry = this.students.get(input.studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    const available = entry.snapshot.availablePoints + input.delta;
    if (available < 0) {
      return { refusal: { code: 'insufficient-credits' as const, message: '积分不足' } };
    }
    entry.snapshot = { ...entry.snapshot, availablePoints: available };
    return { value: { availablePoints: available } };
  }
  async recordStudentLedgerEntry(entry: { studentId: number; type: string; amount: number; description: string }) {
    this.ledger.push(entry);
  }
  async listStudentLedger(studentId: number) {
    return this.ledger
      .filter((entry) => entry.studentId === studentId)
      .map((entry, index) => ({
        id: index + 1,
        studentId: entry.studentId,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        createdAt: '2026-01-01 00:00:00',
      }));
  }
  async sumClassPointsEarnedSince() {
    return this.ledger.filter((entry) => entry.type === 'ADD_POINTS').reduce((sum, e) => sum + e.amount, 0);
  }
  async checkStudentFeature(studentId: number) {
    const entry = this.students.get(studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    if (!entry.featureEnabled) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
  async checkClassFeature() {
    const enabled = [...this.students.values()].some((entry) => entry.featureEnabled);
    if (!enabled) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
  async checkAnyClassFeature() {
    return this.checkClassFeature();
  }
}

function setup() {
  const repository = new FakeEconomyRepository();
  const classroom = new FakeClassroom();
  classroom.students.set(1, {
    snapshot: { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 200 },
    featureEnabled: true,
  });
  repository.accounts.set(1, { student_id: 1, deposit_amount: 80, interest_rate: 0.05, last_interest_date: null });
  repository.stocks.set(2, { id: 2, class_id: 3, name: '课堂之星', symbol: 'STAR', current_price: 20, trend_history: '[20]' });
  return { repository, classroom, service: new EconomyService(repository, classroom) };
}

describe('EconomyService', () => {
  let repository: FakeEconomyRepository;
  let classroom: FakeClassroom;
  let service: EconomyService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('auto-creates bank accounts for new students', async () => {
    classroom.students.set(4, {
      snapshot: { id: 4, classId: 3, userId: null, name: '小红', totalPoints: 0, availablePoints: 0 },
      featureEnabled: true,
    });
    expect((await service.getBankAccount(4)).deposit_amount).toBe(0);
    expect(repository.accounts.has(4)).toBe(true);
  });

  it('rejects deposits and withdrawals with insufficient balance', async () => {
    await expect(service.deposit(1, { amount: 500 })).rejects.toThrow(ApiError);
    await expect(service.withdraw(1, { amount: 500 })).rejects.toThrow(ApiError);
  });

  it('buys stock and recalculates average price', async () => {
    await service.buyStock(1, { stockId: 2, shares: 2 });
    repository.stocks.set(2, { ...repository.stocks.get(2)!, current_price: 40 });
    await service.buyStock(1, { stockId: 2, shares: 2 });

    const holding = repository.getHolding(1, 2)!;
    expect(holding.shares).toBe(4);
    expect(holding.average_buy_price).toBe(30);
    // 200 - 2*20 - 2*40 = 80, moved through the port rather than by writing `students`
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(80);
  });

  it('rejects stock sales above the current holding', async () => {
    await service.buyStock(1, { stockId: 2, shares: 1 });
    await expect(service.sellStock(1, { stockId: 2, shares: 2 })).rejects.toThrow(ApiError);
  });

  it('supports teacher stock CRUD', async () => {
    const created = await service.createStock({ class_id: 3, name: '阅读之星', symbol: 'read', current_price: 100 });
    await service.updateStock(created.id, { class_id: 3, name: '阅读之星', symbol: 'READ', current_price: 120 });

    expect(repository.getStock(created.id)?.symbol).toBe('READ');
    expect(repository.getStock(created.id)?.current_price).toBe(120);

    await service.deleteStock(created.id);
    expect(repository.getStock(created.id)).toBeNull();
  });

  it('appends every money movement to the shared ledger through the port', async () => {
    await service.deposit(1, { amount: 50 });
    await service.withdraw(1, { amount: 30 });

    expect(classroom.ledger.map((entry) => entry.type)).toEqual(['BANK_DEPOSIT', 'BANK_WITHDRAW']);
    expect(classroom.ledger.map((entry) => entry.amount)).toEqual([-50, 30]);
  });

  it('rejects the whole operation when the class has the feature disabled', async () => {
    classroom.students.get(1)!.featureEnabled = false;

    await expect(service.getBankAccount(1)).rejects.toMatchObject({ status: 403 });
    // Nothing moved: the gate runs before any bank write.
    expect(repository.accounts.get(1)?.deposit_amount).toBe(80);
  });

  it('reports a missing student as 404 before the feature gate', async () => {
    await expect(service.getBankAccount(999)).rejects.toMatchObject({ status: 404 });
  });

  /**
   * The interesting failure: the platform tables are written first, then the port
   * moves the balance. If the port refuses, the bank write must be undone, or the
   * student's deposit would exist without the points having left their balance.
   */
  it('rolls the bank deposit back when the credit transfer is refused', async () => {
    classroom.failCredits = { code: 'insufficient-credits', message: '积分不足' };

    await expect(service.deposit(1, { amount: 50 })).rejects.toThrow(ApiError);
    expect(repository.accounts.get(1)?.deposit_amount).toBe(80);
  });

  it('rolls the holding back when the credit transfer is refused', async () => {
    classroom.failCredits = { code: 'insufficient-credits', message: '积分不足' };

    await expect(service.buyStock(1, { stockId: 2, shares: 1 })).rejects.toThrow(ApiError);
    expect(repository.getHolding(1, 2)).toBeNull();
    expect(classroom.ledger).toHaveLength(0);
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so
 * it is worth one test that the plugin's `DbApi` is what it actually reaches for - and
 * that it never touches `students`.
 */
describe('createEconomyRepository', () => {
  it('touches only tables economy declared', () => {
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

    const repository = createEconomyRepository(stub as never);
    repository.getOrCreateBankAccount(1);
    repository.listStocks(1);
    repository.listPortfolio(1);

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    expect([...touched].sort()).toEqual(['bank_accounts', 'stocks', 'student_stocks']);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('records');
  });
});
